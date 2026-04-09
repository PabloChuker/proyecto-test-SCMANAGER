import { ShipQuickAccessWrapper } from "./ShipQuickAccessWrapper";

export default function ShipsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ShipQuickAccessWrapper />
      {children}
    </>
  );
}
