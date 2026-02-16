import { assign, createActor, setup, spawn } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";
import type { Hypothesis } from "speechstate";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  value?: boolean;
  type?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  eugene: { person: "Adib Wahid" },

  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },

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
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
  "19": { time: "19:00" },
  "20": { time: "20:00" },
  "21": { time: "21:00" },
  "22": { time: "22:00" },
  "23": { time: "23:00" },

  yes: { value: true },
  yeah: { value: true },
  yep: { value: true },
  yup: { value: true },

  no: { value: false },
  nope: { value: false },

  appointment: { type: "appointment" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  guards: {
    hasIdentifiedPerson: ({ context }) => !!context.metadata?.person,
    hasIdentifiedDay: ({ context }) => !!context.metadata?.day,
    hasIdentifiedWholeDay: ({ context }) =>
      context.metadata?.value !== undefined,
    isWholeDay: ({ context }) => context.appointmentDetails?.wholeDay === true,
    hasIdentifiedTime: ({ context }) => !!context.metadata?.time,
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
        metadata: grammar[utterance] || {},
        appointmentDetails: context.appointmentDetails,
      };
    }),
    "spst.clearData": assign({ lastResult: null, metadata: null }),
  },
}).createMachine({
  spstRef: spawn(speechstate, { input: settings }),
  lastResult: null,
  appointmentDetails: {},
  id: "DM",
  initial: "Appointment",
  states: {
    // Start directly with Appointment
    Appointment: {
      initial: "Prompt",
      on: {
        RECOGNISED: { actions: "spst.recognised" },
        ASR_NOINPUT: { target: ".NoInput", actions: "spst.clearData" },
        LISTEN_COMPLETE: ".NoInput",
      },
      states: {
        Prompt: {
          entry: [
            { type: "spst.speak", params: { utterance: "Let's create an appointment." } },
            "spst.clearData",
            assign({ appointmentDetails: {} }),
          ],
          on: { SPEAK_COMPLETE: "PromptPerson" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
          on: {
            SPEAK_COMPLETE: [
              { target: "PromptPerson", guard: ({ context }) => !context.appointmentDetails?.person },
              { target: "PromptDay", guard: ({ context }) => !context.appointmentDetails?.day },
              { target: "PromptWholeDay", guard: ({ context }) => !context.appointmentDetails?.wholeDay },
              { target: "PromptTime", guard: ({ context }) => context.appointmentDetails?.wholeDay === false && !context.appointmentDetails?.time },
              { target: "Prompt" },
            ],
          },
        },
        PromptPerson: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: context.lastResult ? "I didn't catch the name. Who are you meeting with?" : "Who are you meeting with?",
          }) },
          on: { SPEAK_COMPLETE: "AskPerson" },
        },
        AskPerson: { entry: "spst.listen", on: { LISTEN_COMPLETE: [
          { target: "PersonIdentified", guard: "hasIdentifiedPerson" },
          { target: "PromptPerson" },
        ] } },
        PersonIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: { ...context.appointmentDetails, person: context.metadata?.person },
            })),
            { type: "spst.speak", params: ({ context }) => ({ utterance: `You are meeting with ${context.metadata?.person}` }) },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: "PromptDay" },
        },
        PromptDay: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: context.lastResult ? "I didn't catch the day. On which day is your meeting?" : "On which day is your meeting?",
          }) },
          on: { SPEAK_COMPLETE: "AskDay" },
        },
        AskDay: { entry: "spst.listen", on: { LISTEN_COMPLETE: [
          { target: "DayIdentified", guard: "hasIdentifiedDay" },
          { target: "PromptDay" },
        ] } },
        DayIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: { ...context.appointmentDetails, day: context.metadata?.day },
            })),
            { type: "spst.speak", params: ({ context }) => ({
              utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.metadata?.day}`,
            }) },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: "PromptWholeDay" },
        },
        PromptWholeDay: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: context.lastResult ? "I didn't catch your answer. Will it take the whole day?" : "Will it take the whole day?",
          }) },
          on: { SPEAK_COMPLETE: "AskWholeDay" },
        },
        AskWholeDay: { entry: "spst.listen", on: { LISTEN_COMPLETE: [
          { target: "WholeDayIdentified", guard: "hasIdentifiedWholeDay" },
          { target: "PromptWholeDay" },
        ] } },
        WholeDayIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: { ...context.appointmentDetails, wholeDay: context.metadata?.value },
            })),
            { type: "spst.speak", params: ({ context }) => ({
              utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} and ${context.appointmentDetails?.wholeDay ? "it will take the whole day" : "it will not take the whole day"}`,
            }) },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: [
            { target: "PromptCreateAppointmentWholeDay", guard: "isWholeDay" },
            { target: "PromptTime" },
          ] },
        },
        PromptTime: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: context.lastResult ? "I didn't catch the time. What time is your meeting?" : "What time is your meeting?",
          }) },
          on: { SPEAK_COMPLETE: "AskTime" },
        },
        AskTime: { entry: "spst.listen", on: { LISTEN_COMPLETE: [
          { target: "TimeIdentified", guard: "hasIdentifiedTime" },
          { target: "PromptTime" },
        ] } },
        TimeIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: { ...context.appointmentDetails, time: context.metadata?.time },
            })),
            { type: "spst.speak", params: ({ context }) => ({
              utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} at ${context.appointmentDetails?.time}`,
            }) },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: "PromptCreateAppointmentWithTime" },
        },
        PromptCreateAppointmentWithTime: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} at ${context.appointmentDetails?.time}?`,
          }) },
          on: { SPEAK_COMPLETE: "Confirmation" },
        },
        PromptCreateAppointmentWholeDay: {
          entry: { type: "spst.speak", params: ({ context }) => ({
            utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} for the whole day?`,
          }) },
          on: { SPEAK_COMPLETE: "Confirmation" },
        },
        Confirmation: {
          entry: ["spst.listen", "spst.clearData"],
          on: { LISTEN_COMPLETE: [
            { target: "Done", guard: "hasConfirmed" },
            { target: "Prompt", guard: "hasDenied" },
            { target: "PromptCreateAppointmentWholeDay", guard: "isWholeDay" },
            { target: "PromptCreateAppointmentWithTime" },
          ] },
        },
        Done: {
          entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    Done: {
      on: { CLICK: "Appointment" }, // restart
    },
  },
});

const dmActor = createActor(dmMachine, { inspect: inspector.inspect }).start();

dmActor.subscribe((state) => {
  console.log("State update:", state.value, state.context);
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => dmActor.send({ type: "CLICK" }));
}
