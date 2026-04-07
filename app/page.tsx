"use client";

import Link from "next/link";
import { HOME_CARDS, HOME_SECTION_LABEL } from "./config/homeCards";
import { BRAND_NAME } from "./config/site";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

const DOCS_URL = "https://respan.ai/docs";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-10 flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{BRAND_NAME} Demo</h1>
          <p className="text-gray-600 italic uppercase text-[10px] tracking-widest font-bold">
            {HOME_SECTION_LABEL}
          </p>
          <p className="text-[11px] text-gray-600 mt-2">
            Recommended: run locally with env vars for the simplest setup.{" "}
            <a
              className="text-black underline underline-offset-4"
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
            >
              respan.ai/docs
            </a>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HOME_CARDS.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="block text-left p-6 hover:border-black transition-all h-full">
                <CardTitle className="mb-2">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
