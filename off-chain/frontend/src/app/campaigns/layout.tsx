/**
 * Campaign pages keep the narrow content column; the home page lays out its own full-bleed sections.
 */
export default function CampaignsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="max-w-6xl mx-auto px-4 py-8">{children}</div>;
}
