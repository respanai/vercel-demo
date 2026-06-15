"use client";

import Link from "next/link";
import { EXAMPLE_PAGES } from "./config/sections";
import { PLATFORM_URL } from "../config/site";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default function ExamplesPage() {
  const featured = EXAMPLE_PAGES.filter((p) => p.featured);
  const rest = EXAMPLE_PAGES.filter((p) => !p.featured);

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-3">
          <Link href="/" className="text-xs font-mono underline underline-offset-4">
            ← Back
          </Link>
        </div>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Examples</h1>
            <p className="text-xs text-gray-600 mt-2">
              Interactive demos and example use cases for Respan.
            </p>
          </div>
          <Button asChild>
            <a href={PLATFORM_URL} target="_blank" rel="noreferrer">
              Platform
            </a>
          </Button>
        </div>

        {/* Featured */}
        {featured.map((page) => (
          <Link key={page.href} href={page.href} className="block mb-6">
            <Card className="p-8 border-2 border-black hover:bg-gray-50 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono font-bold bg-black text-white px-2 py-0.5">
                  INTERACTIVE
                </span>
              </div>
              <CardTitle className="text-lg mb-2">{page.label}</CardTitle>
              <CardDescription>{page.description}</CardDescription>
            </Card>
          </Link>
        ))}

        {/* Rest */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rest.map((page) => (
            <Link key={page.href} href={page.href}>
              <Card className="block text-left p-6 hover:border-black transition-all h-full">
                <CardTitle className="mb-2">{page.label}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
