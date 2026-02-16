import { assign, createActor, setup } from "xstate";
import type { Settings, Hypothesis } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

/* ---------------- AZURE SETTINGS ---------------- */

const settings: Settings = {
  azureCredentials: {
    endpoint:
      "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
    key: KEY,
  },
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* ---------------- GRAMMAR ---------------- */

const grammar: Record<string, any> = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  yes: { value: true },
  no: { value: false },
};

/* ---------------- MACHINE ---------------- */

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },

  guards: {
    hasPerson: ({ context }) => !!context.metadata?.person,
    hasDay: ({ context }) => !!context.metadata?.day,
    confirmed: ({ context }) => context.metadata?.value === true,
  },

  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),

    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN" }),

    "spst.recognised": assign(({ event }) => {
  const recognised = event as {
    type: "RECOGNISED";
    value: Hypothesis[];
  };

  const utterance =
    recognised.value?.[0]?.utterance?.toLowerCase() ?? "";

  let metadata: any = {};

  if (utterance.includes("monday")) {
    metadata.day = "Monday";
  }

  if (utterance.includes("tuesday")) {
    metadata.day = "Tuesday";
  }

  if (utterance.includes("vlad")) {
    metadata.person = "Vladislav Maraev";
  }

  if (utterance.includes("bora")) {
    metadata.person = "Bora Kara";
  }

  if (utterance.includes("yes")) {
    metadata.value = true;
  }

  if (utterance.includes("no")) {
    metadata.value = false;
  }

  return {
    lastResult: recognised.value,
    lastUtterance: utterance,
    metadata,
  };
}),


    "spst.clearData": assign({
      lastResult: null,
      metadata: null,
    }),
  },
}).createMachine({
  id: "DM",

  /* ✅ IMPORTANT: SPAWN PROPERLY */
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, {
      input: settings,
    }),
    lastResult: null,
    lastUtterance: null,
    metadata: null,
    appointmentDetails: {},
  }),

  initial: "Prepare",

  states: {
    /* ---------------- REQUIRED BOOT SEQUENCE ---------------- */

    Prepare: {
      entry: ({ context }) =>
        context.spstRef.send({ type: "PREPARE" }),
      on: {
        ASRTTS_READY: "WaitToStart",
      },
    },

    WaitToStart: {
      on: {
        CLICK: "Appointment",
      },
    },

    /* ---------------- APPOINTMENT FLOW ---------------- */

    Appointment: {
      initial: "Prompt",

      on: {
        RECOGNISED: {
          actions: "spst.recognised",
        },
        ASR_NOINPUT: {
          actions: "spst.clearData",
        },
      },

      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "Let's create an appointment.",
            },
          },
          on: {
            SPEAK_COMPLETE: "AskPerson",
          },
        },

        AskPerson: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "Who are you meeting with?",
            },
          },
          on: {
            SPEAK_COMPLETE: "ListenPerson",
          },
        },

        ListenPerson: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "SavePerson", guard: "hasPerson" },
              { target: "AskPerson" },
            ],
          },
        },

        SavePerson: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                person: context.metadata.person,
              },
            })),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: `Meeting with ${context.metadata.person}`,
              }),
            },
            "spst.clearData",
          ],
          on: {
            SPEAK_COMPLETE: "AskDay",
          },
        },

        AskDay: {
          entry: {
            type: "spst.speak",
            params: { utterance: "On which day?" },
          },
          on: {
            SPEAK_COMPLETE: "ListenDay",
          },
        },

        ListenDay: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "SaveDay", guard: "hasDay" },
              { target: "AskDay" },
            ],
          },
        },

        SaveDay: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                day: context.metadata.day,
              },
            })),
            {
              type: "spst.speak",
              params: { utterance: "Do you want me to create it?" },
            },
            "spst.clearData",
          ],
          on: {
            SPEAK_COMPLETE: "ListenConfirm",
          },
        },

        ListenConfirm: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "Done", guard: "confirmed" },
              { target: "Prompt" },
            ],
          },
        },

        Done: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "Your appointment has been created!",
            },
          },
          on: {
            SPEAK_COMPLETE: "#DM.Done",
          },
        },
      },
    },

    Done: {
      on: {
        CLICK: "Appointment",
      },
    },
  },
});

/* ---------------- ACTOR ---------------- */

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

/* ---------------- BUTTON ---------------- */

export function setupButton(button: HTMLButtonElement) {
  button.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((snapshot) => {
    const meta: any =
      Object.values(
        snapshot.context.spstRef.getSnapshot().getMeta(),
      )[0] || {};

    button.innerHTML = `${meta.view ?? "Start"}`;
  });
}
