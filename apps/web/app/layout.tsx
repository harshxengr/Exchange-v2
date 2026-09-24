import type {
  Metadata,
} from 'next';

import './globals.css';

export const metadata:
  Metadata = {
  title:
    'Exchange',

  description:
    'Real-time exchange trading interface',
};

export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  return (
    <html
      lang="en"
    >
      <body>
        {children}
      </body>
    </html>
  );
}