export const STATUS_TONE: Record<string, "gold" | "rose" | "grey" | "dark"> = {
  NEW: "rose", IN_PROGRESS: "gold", CLARIFICATION: "rose", FULFILLED: "dark", ON_HOLD: "grey", LOST: "grey",
};
export const STATUS_TEXT: Record<string, string> = {
  NEW: "New", IN_PROGRESS: "In progress", CLARIFICATION: "Waiting on clarification", FULFILLED: "Fulfilled", ON_HOLD: "On hold", LOST: "Lost",
};
