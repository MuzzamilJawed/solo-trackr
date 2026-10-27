"use client";

import { useState } from "react";
import { Circle, Gem, Wrench } from "lucide-react";

interface PriceData {
  gold?: number;
  silver?: number;
}

export default function DebugPage() {
  const [goldData, setGoldData] = useState<PriceData | null>(null);
  const [silverData, setSilverData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const testApi = async () => {
    try {
      setLoading(true);
      setError("");

      // Test direct API calls
      console.log("Testing Gold API...");
      const goldRes = await fetch("https://api.metals.live/v1/spot/gold");
      const goldJson = await goldRes.json() as PriceData;
      console.log("Gold response:", goldJson);
      setGoldData(goldJson);

      console.log("Testing Silver API...");
      const silverRes = await fetch("https://api.metals.live/v1/spot/silver");
      const silverJson = await silverRes.json() as PriceData;
      console.log("Silver response:", silverJson);
      setSilverData(silverJson);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("API Error:", err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
          <Wrench className="inline-block mr-2 h-7 w-7" strokeWidth={2} /> API Debug Page
        </h1>

        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-700 mb-6">
          <button
            onClick={testApi}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-6 rounded-lg w-full"
          >
            {loading ? "Testing API..." : "Test Metal Prices API"}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-800 dark:text-red-200 px-4 py-3 rounded mb-6">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {goldData && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-700 mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
              <Gem className="inline-block mr-2 h-5 w-5 text-amber-500" strokeWidth={2} /> Gold Price Data
            </h2>
            <pre className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded overflow-auto text-sm text-zinc-900 dark:text-zinc-50">
              {JSON.stringify(goldData, null, 2)}
            </pre>
            {goldData.gold && (
              <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Current Gold Price: ${goldData.gold} USD/oz
                <br />
                In PKR: ₹{Math.round(goldData.gold * 280)} per troy ounce
                <br />
                Per Tola (24K): ₹{Math.round((goldData.gold * 280) / 0.375)}
              </p>
            )}
          </div>
        )}

        {silverData && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-700 mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
              <Circle className="inline-block mr-2 h-5 w-5 text-zinc-400" strokeWidth={2} /> Silver Price Data
            </h2>
            <pre className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded overflow-auto text-sm text-zinc-900 dark:text-zinc-50">
              {JSON.stringify(silverData, null, 2)}
            </pre>
            {silverData.silver && (
              <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Current Silver Price: ${silverData.silver} USD/oz
                <br />
                In PKR: ₹{Math.round(silverData.silver * 280)} per ounce
                <br />
                Per Kilogram: ₹
                {Math.round(silverData.silver * 280 * 31.1035)}
              </p>
            )}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">
            ℹ Instructions
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-200">
            <li>Click &quot;Test Metal Prices API&quot; button above</li>
            <li>Check if you see JSON data appear</li>
            <li>If gold and silver values appear, API is working</li>
            <li>If not, check your internet connection</li>
            <li>Open browser console (F12) to see detailed logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
