import "./home.css";
import { Hero } from "@/components/home/Hero";
import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-gray-900">
      <main>
        <Hero />
        <ul className="flex justify-center space-x-6 p-4 text-gray-400">
          <li>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
          </li>
        </ul>
      </main>
    </div>
  );
}
