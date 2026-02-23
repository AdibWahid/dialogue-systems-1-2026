import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
<<<<<<< HEAD
=======
  lastUtterance?: string;
>>>>>>> a61d767 (Lab 4 general part)
  metadata?: Record<string, any> | null;
  appointmentDetails?: Record<string, any> | null;
}

export type DMEvents =
  | SpeechStateExternalEvent
  | { type: "CLICK" }
  | { type: "DONE" };