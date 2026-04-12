import type { AppProps } from "next/app";
import { MedicationsProvider } from "@/context/MedicationsContext";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MedicationsProvider>
      <Component {...pageProps} />
    </MedicationsProvider>
  );
}
