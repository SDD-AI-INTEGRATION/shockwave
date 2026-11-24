import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import './pmo/pmo.css';
export const metadata: Metadata = { title: 'Shockwave — Project Management Office', description: 'Workspace proyek PT Swadharma Duta Data.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="id"><body>{children}</body></html>;
}
