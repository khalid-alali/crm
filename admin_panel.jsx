import { useState } from "react";

const STATES = ["linked", "unlinked", "inactive"];

function Badge({ type, children }) {
  const styles = {
    success: { bg: "#EAF3DE", color: "#3B6D11", dot: "#3B6D11" },
    warning: { bg: "#FAEEDA", color: "#854F0B", dot: "#BA7517" },
    danger:  { bg: "#FCEBEB", color: "#A32D2D", dot: "#A32D2D" },
    muted:   { bg: "#F1EFE8", color: "#5F5E5A", dot: "#888780" },
    info:    { bg: "#E6F1FB", color: "#185FA5", dot: "#378ADD" },
  };
  const s = styles[type] || styles.muted;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 500,
      padding: "2px 8px", borderRadius: 99,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888780", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e0dfd8", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Row({ label, children, noBorder }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 14px",
      borderBottom: noBorder ? "none" : "0.5px solid #e0dfd8",
    }}>
      <span style={{ fontSize: 13, color: "#5F5E5A" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2A", display: "flex", alignItems: "center", gap: 6 }}>{children}</span>
    </div>
  );
}



function Btn({ children, danger, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontSize: 12, padding: "4px 10px",
        borderRadius: 8,
        border: danger ? "0.5px solid #F09595" : "0.5px solid #B4B2A9",
        background: hover ? (danger ? "#FCEBEB" : "#F1EFE8") : "transparent",
        cursor: "pointer",
        color: danger ? "#A32D2D" : "#2C2C2A",
      }}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={{ background: "#F1EFE8", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#888780", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "#2C2C2A" }}>{value}</div>
    </div>
  );
}

function LinkedState() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Admin link</SectionLabel>
        <Card>
          <div style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2A" }}>RepairWise admin</span>
              <Badge type="success">Linked</Badge>
            </div>
            <div style={{ fontSize: 12, color: "#B4B2A9" }}>shop_id · savy-auto-service-001</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Btn>Change link</Btn>
              <Btn>Open admin ↗</Btn>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Availability</SectionLabel>
        <Card>
          <Row label="Shop status" noBorder><Badge type="success">Active</Badge></Row>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Job limits</SectionLabel>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 14px" }}>
            <MetricCard label="Max per day" value="1" />
            <MetricCard label="Max per week" value="3" />
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Rates</SectionLabel>
        <Card>
          <Row label="Standard labor"><span style={{ color: "#B4B2A9" }}>—</span></Row>
          <Row label="Warranty labor" noBorder><span style={{ color: "#B4B2A9" }}>—</span></Row>
        </Card>
      </div>
    </>
  );
}

function UnlinkedState() {
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel>Admin link</SectionLabel>
      <Card>
        <div style={{ padding: "20px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F1EFE8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5L4.5 11.5C3.67 12.33 2.33 12.33 1.5 11.5C0.67 10.67 0.67 9.33 1.5 8.5L3.5 6.5M9.5 6.5L11.5 4.5C12.33 3.67 13.67 3.67 14.5 4.5C15.33 5.33 15.33 6.67 14.5 7.5L12.5 9.5M5.5 10.5L10.5 5.5" stroke="#888780" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2A" }}>No admin link</div>
          <div style={{ fontSize: 12, color: "#888780", maxWidth: 240 }}>
            This shop isn't linked to a RepairWise admin account. Jobs can't be dispatched until a link is set.
          </div>
          <Btn>+ Link admin account</Btn>
        </div>
      </Card>
    </div>
  );
}

function InactiveState() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Admin link</SectionLabel>
        <Card>
          <div style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2A" }}>RepairWise admin</span>
              <Badge type="muted">Linked</Badge>
            </div>
            <div style={{ fontSize: 12, color: "#B4B2A9" }}>shop_id · savy-auto-service-001</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Btn>Change link</Btn>
              <Btn>Open admin ↗</Btn>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Availability</SectionLabel>
        <Card>
          <Row label="Shop status" noBorder><Badge type="danger">Inactive</Badge></Row>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Job limits</SectionLabel>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 14px" }}>
            <MetricCard label="Max per day" value="1" />
            <MetricCard label="Max per week" value="3" />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function AdminPanel() {
  const [activeState, setActiveState] = useState("linked");

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 520, margin: "0 auto", padding: "0 0 2rem" }}>
      {/* Tab bar (simulating the existing tab row) */}
      <div style={{
        display: "flex", borderBottom: "0.5px solid #e0dfd8",
        marginBottom: 20, gap: 0,
      }}>
        {["Activity", "Contracts", "Programs", "Capabilities", "Admin"].map(tab => (
          <div key={tab} style={{
            padding: "10px 16px", fontSize: 13,
            borderBottom: tab === "Admin" ? "2px solid #2C2C2A" : "2px solid transparent",
            fontWeight: tab === "Admin" ? 500 : 400,
            color: tab === "Admin" ? "#2C2C2A" : "#888780",
            cursor: "pointer",
          }}>
            {tab}
          </div>
        ))}
      </div>

      {/* State switcher — for preview only */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        padding: "8px 10px",
        background: "#F1EFE8", borderRadius: 10,
        alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "#888780", marginRight: 4, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>Preview state:</span>
        {STATES.map(s => (
          <button
            key={s}
            onClick={() => setActiveState(s)}
            style={{
              fontSize: 12, padding: "4px 12px", borderRadius: 99,
              border: "0.5px solid",
              borderColor: activeState === s ? "#5F5E5A" : "#D3D1C7",
              background: activeState === s ? "#2C2C2A" : "transparent",
              color: activeState === s ? "#fff" : "#5F5E5A",
              cursor: "pointer", fontWeight: activeState === s ? 500 : 400,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {activeState === "linked"   && <LinkedState />}
      {activeState === "unlinked" && <UnlinkedState />}
      {activeState === "inactive" && <InactiveState />}
    </div>
  );
}
