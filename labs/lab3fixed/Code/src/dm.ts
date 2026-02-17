import { assign, createActor, setup } from "xstate";
import type { Settings, Hypothesis } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  time?: string;
  value?: boolean;
  type?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  adib: { person: "Adib Wahid" },
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },

  "1": { time: "01:00" },
  "2": { time: "02:00" },
  "3": { time: "03:00" },
  "4": { time: "04:00" },
  "5": { time: "05:00" },
  "6": { time: "06:00" },
  "7": { time: "07:00" },
  "8": { time: "08:00" },
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "1:00 AM": { time: "01:00" },
  "2:00 AM": { time: "02:00" },
  "3:00 AM": { time: "03:00" },
  "4:00 AM": { time: "04:00" },
  "5:00 AM": { time: "05:00" },
  "6:00 AM": { time: "06:00" },
  "7:00 AM": { time: "07:00" },
  "8:00 AM": { time: "08:00" },
  "9:00 AM": { time: "09:00" },
  "10:00 AM": { time: "10:00" },
  "11:00 AM": { time: "11:00" },
  "12:00 PM": { time: "12:00" },
  "1:00 PM": { time: "13:00" },
  "2:00 PM": { time: "14:00" },
  "3:00 PM": { time: "15:00" },
  "4:00 PM": { time: "16:00" },
  "5:00 PM": { time: "17:00" },
  "6:00 PM": { time: "18:00" },
  "7:00 PM": { time: "19:00" },
  "8:00 PM": { time: "20:00" },
  "9:00 PM": { time: "21:00" },
  "10:00 PM": { time: "22:00" },
  "11:00 PM": { time: "23:00" },

  yes: { value: true },
  no: { value: false },
  yep: { value: true },
  nope: { value: false },
  yeah: { value: true },
  nah: { value: false },
  sure: { value: true },
  "of course": { value: true },
  cancel: { value: false },
  positive: { value: true },
  negative: { value: false },

  appointment: { type: "appointment" },
};

const hasMatch = (utterance: string) =>
  Object.keys(grammar).some((key) => utterance.includes(key.toLowerCase()));

const getMatch = (utterance: string) =>
  Object.keys(grammar).find((key) => utterance.includes(key.toLowerCase()));

const getPerson = (context: DMContext): string =>
  context.metadata?.person || getMatch(context.lastUtterance ?? "") || "";

const dmMachine = setup({
  types: { context: {} as DMContext, events: {} as DMEvents },
  guards: {
    isAppointment: ({ context }) =>
      (context.lastUtterance || "").includes("appointment") ||
      context.metadata?.type === "appointment",

    hasIdentifiedPerson: ({ context }) =>
      !!context.metadata?.person || hasMatch(context.lastUtterance ?? ""),

    hasIdentifiedTime: ({ context }) =>
      !!context.metadata?.time || hasMatch(context.lastUtterance ?? ""),

    hasIdentifiedWholeDay: ({ context }) => context.metadata?.value !== undefined,

    hasConfirmed: ({ context }) => context.metadata?.value === true,
    hasDenied: ({ context }) => context.metadata?.value === false,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({ type: "SPEAK", value: { utterance: params.utterance } }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN" }),
    "spst.recognised": assign(({ event, context }) => {
      const recognisedEvent = event as { type: "RECOGNISED"; value: Hypothesis[] };
      const utterance = recognisedEvent.value[0].utterance.toLowerCase();
      return {
        lastResult: recognisedEvent.value,
        lastUtterance: utterance,
        metadata: grammar[utterance] || {},
        appointmentDetails: context.appointmentDetails,
      };
    }),
    "spst.clearData": assign({ lastResult: null, metadata: null }),
  },
}).createMachine({
  id: "DM",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    appointmentDetails: {},
  }),
  initial: "Prepare",
  states: {
    Prepare: { entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }), on: { ASRTTS_READY: "Appointment" } },

    Appointment: {
      initial: "Prompt",
      on: {
        RECOGNISED: { actions: "spst.recognised" },
        ASR_NOINPUT: { target: ".NoInput", actions: "spst.clearData" },
        LISTEN_COMPLETE: ".NoInput",
      },
      states: {
        Prompt: { entry: [{ type: "spst.speak", params: { utterance: "Let's create an appointment." } }, "spst.clearData", assign({ appointmentDetails: {} })], on: { SPEAK_COMPLETE: "PromptPerson" } },
        NoInput: { entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } }, on: { SPEAK_COMPLETE: "PromptPerson" } },

        PromptPerson: { entry: [{ type: "spst.speak", params: ({ context }) => ({ utterance: context.lastResult ? "I didn't catch the name. Who are you meeting with?" : "Who are you meeting with?" }) }, "spst.clearData", assign({ appointmentDetails: {} })], on: { SPEAK_COMPLETE: "AskPerson" } },
        AskPerson: { entry: "spst.listen", on: { LISTEN_COMPLETE: [{ target: "PersonIdentified", guard: "hasIdentifiedPerson" }, { target: "PromptPerson" }] } },
        PersonIdentified: { entry: [assign(({ context }) => ({ appointmentDetails: { ...context.appointmentDetails, person: getPerson(context) } })), { type: "spst.speak", params: ({ context }) => ({ utterance: `You are meeting with ${context.appointmentDetails?.person}` }) }, "spst.clearData"], on: { SPEAK_COMPLETE: "PromptWholeDay" } },

        PromptWholeDay: { entry: { type: "spst.speak", params: ({ context }) => ({ utterance: context.lastResult ? "I didn't catch your answer. Will it take the whole day?" : "Will it take the whole day?" }) }, on: { SPEAK_COMPLETE: "AskWholeDay" } },
        AskWholeDay: { entry: "spst.listen", on: { LISTEN_COMPLETE: [{ target: "WholeDayIdentified", guard: "hasIdentifiedWholeDay" }, { target: "PromptWholeDay" }] } },
        WholeDayIdentified: { entry: [assign(({ context }) => ({ appointmentDetails: { ...context.appointmentDetails, wholeDay: context.metadata?.value } })), { type: "spst.speak", params: ({ context }) => ({ utterance: `You are meeting with ${context.appointmentDetails?.person} and it will ${context.appointmentDetails?.wholeDay ? "" : "not "}take the whole day` }) }, "spst.clearData"], on: { SPEAK_COMPLETE: [{ target: "PromptTime", guard: ({ context }) => !context.appointmentDetails?.wholeDay }, { target: "PromptCreateAppointmentWholeDay", guard: ({ context }) => context.appointmentDetails?.wholeDay }] } },

        PromptTime: { entry: { type: "spst.speak", params: ({ context }) => ({ utterance: context.lastResult ? "I didn't catch the time. What time is your meeting?" : "What time is your meeting?" }) }, on: { SPEAK_COMPLETE: "AskTime" } },
        AskTime: { entry: "spst.listen", on: { LISTEN_COMPLETE: [{ target: "TimeIdentified", guard: "hasIdentifiedTime" }, { target: "PromptTime" }] } },
        TimeIdentified: { entry: [assign(({ context }) => ({ appointmentDetails: { ...context.appointmentDetails, time: context.metadata?.time } })), { type: "spst.speak", params: ({ context }) => ({ utterance: `You are meeting with ${context.appointmentDetails?.person} at ${context.appointmentDetails?.time}` }) }, "spst.clearData"], on: { SPEAK_COMPLETE: "PromptCreateAppointmentWithTime" } },

        PromptCreateAppointmentWithTime: { entry: { type: "spst.speak", params: ({ context }) => ({ utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} at ${context.appointmentDetails?.time}?` }) }, on: { SPEAK_COMPLETE: "Confirmation" } },
        PromptCreateAppointmentWholeDay: { entry: { type: "spst.speak", params: ({ context }) => ({ utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} for the whole day?` }) }, on: { SPEAK_COMPLETE: "Confirmation" } },

        Confirmation: { entry: ["spst.listen", "spst.clearData"], on: { LISTEN_COMPLETE: [{ target: "Done", guard: "hasConfirmed" }, { target: "PromptPerson", guard: "hasDenied" }] } },
        Done: { entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } }, on: { SPEAK_COMPLETE: "#DM.Done" } },
      },
    },

    Done: { on: { CLICK: "Appointment" } },
  },
});

const dmActor = createActor(dmMachine, { inspect: inspector.inspect }).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => dmActor.send({ type: "CLICK" }));
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(snapshot.context.spstRef.getSnapshot().getMeta())[0] || { view: undefined };
    element.innerHTML = `${meta.view}`;
  });
}
