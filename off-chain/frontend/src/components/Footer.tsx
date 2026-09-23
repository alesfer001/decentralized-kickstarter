import Link from "next/link";
import { REPO_URL } from "@/lib/constants";
import { LogoMark } from "./Logo";

interface FooterLink {
  label: string;
  href: string;
  /** Links that leave the site open in a new tab */
  external?: boolean;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Launch app", href: "/app" },
      { label: "Create a campaign", href: "/campaigns/new" },
      { label: "How it works", href: "/#how" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "GitHub", href: REPO_URL, external: true },
      { label: "Contracts", href: `${REPO_URL}/tree/main/contracts`, external: true },
    ],
  },
  {
    title: "Community",
    links: [
      {
        label: "Nervos Talk",
        href: "https://talk.nervos.org/t/introducing-ckb-kickstarter-decentralized-all-or-nothing-crowdfunding-on-nervos-ckb-testnet-mvp-live/10130",
        external: true,
      },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line-2 pt-12 pb-8 text-[13px] text-ink-3">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 font-display font-medium text-sm tracking-wide text-ink">
              <LogoMark size={22} />
              CROWDCELL
            </Link>
            <p className="mt-3 max-w-[28em]">All-or-nothing crowdfunding on Nervos CKB, settled by on-chain scripts.</p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="eyebrow !text-[11px]">{column.title}</p>
              <ul className="mt-3 grid gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="hover:text-ink">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 pt-6 border-t border-line-2">
          Testnet preview. CrowdCell runs on the CKB testnet with test CKB only; no real funds are involved.
        </p>
      </div>
    </footer>
  );
}
