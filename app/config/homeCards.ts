export const HOME_SECTION_LABEL = "APIs and examples";

export interface HomeCard {
  title: string;
  description: string;
  href: string;
}

export const HOME_CARDS: HomeCard[] = [
  {
    title: "APIs",
    description:
      "Walk through Respan API endpoints step-by-step (Logs, Traces, …).",
    href: "/apis",
  },
  {
    title: "Examples",
    description:
      "Demo use cases: banking chatbot, SEC compliance, lead qualification, prompt optimizer.",
    href: "/examples",
  },
];
