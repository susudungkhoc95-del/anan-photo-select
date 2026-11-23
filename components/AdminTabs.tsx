import Link from "next/link";

const tabs = [
  { id: "select", href: "/", label: "DP Select" },
  { id: "dp", href: "/workflow", label: "DP Workflow" },
  { id: "review", href: "/review", label: "Duyệt ảnh sửa" },
  { id: "show", href: "/show", label: "SHOW" }
] as const;

export default function AdminTabs({ active }: { active: typeof tabs[number]["id"] }) {
  return <nav className="app-tabs header-tabs" aria-label="Khu vực quản trị">
    {tabs.map(({ id, href, label }) => (
      <Link key={id} href={href} className={id === active ? "active" : undefined}
        aria-current={id === active ? "page" : undefined}>{label}</Link>
    ))}
  </nav>;
}
