import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/AuthProvider";

const roboto = Roboto({
    variable: "--font-roboto",
    subsets: ["latin"],
    weight: ["300", "400", "500", "700"],
    display: "swap",
});

const robotoMono = Roboto_Mono({
    variable: "--font-roboto-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "RyteAI",
    description: "RyteAI is an AI powered writing assistant that helps you write better content on an infinite canvas using AI.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${roboto.variable} ${robotoMono.variable} font-sans antialiased`}
            >
                <AuthProvider>
                    {children}
                </AuthProvider>
                <Toaster />
            </body>
        </html>
    );
}
