import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Cloud,
  Download,
  Leaf,
  Link2,
  Menu,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingCart,
  Store,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_QUALITIES,
  DEFAULT_UNITS,
  activeIntermediaries,
  activeProductions,
  activeShipments,
  amount,
  downloadCsv,
  getEndpoint,
  groupQuantity,
  loadData,
  mutate,
  quantitySummary,
  setEndpoint,
  todayISO,
  type AppData,
  type Intermediary,
  type ProductionRecord,
  type ShipmentRecord,
} from "@/lib/googleSheets";

type View =
  | "dashboard"
  | "production"
  | "shipment"
  | "intermediary"
  | "report"
  | "settings";
type ModalKind = "production" | "shipment" | "intermediary" | null;
type Period = "week" | "month" | "year";

type ProductionDraft = {
  date: string;
  area: string;
  quality: string;
  quantity: string;
  unit: string;
  wasteQuantity: string;
  note: string;
};

type ShipmentDraft = {
  date: string;
  intermediaryId: string;
  intermediaryName: string;
  quality: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  freight: string;
  otherFee: string;
  paidAmount: string;
  paymentStatus: string;
  note: string;
};

type IntermediaryDraft = {
  name: string;
  contactPerson: string;
  phone: string;
  defaultUnit: string;
  defaultPrice: string;
  note: string;
};

const emptyData: AppData = {
  productions: [],
  shipments: [],
  intermediaries: [],
  settings: {},
};

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function formatMoney(value: number) {
  return `NT$ ${money.format(Math.round(value || 0))}`;
}

function formatNumber(value: number) {
  return number.format(Number(value || 0));
}

function dateLabel(value: string) {
  if (!value) return "—";
  return value.replaceAll("-", "/");
}

function unitsFrom(data: AppData) {
  return (
    data.settings.units
      ?.split(",")
      .map(item => item.trim())
      .filter(Boolean) || DEFAULT_UNITS
  );
}

function qualitiesFrom(data: AppData) {
  return (
    data.settings.qualities
      ?.split(",")
      .map(item => item.trim())
      .filter(Boolean) || DEFAULT_QUALITIES
  );
}

function isSameMonth(date: string, anchor = todayISO()) {
  return date.slice(0, 7) === anchor.slice(0, 7);
}

function startOfWeek(anchor: string) {
  const date = new Date(`${anchor}T12:00:00`);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function endOfWeek(anchor: string) {
  const date = new Date(`${startOfWeek(anchor)}T12:00:00`);
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}

function isWithinPeriod(date: string, period: Period, anchor: string) {
  if (period === "month") return date.slice(0, 7) === anchor.slice(0, 7);
  if (period === "year") return date.slice(0, 4) === anchor.slice(0, 4);
  return date >= startOfWeek(anchor) && date <= endOfWeek(anchor);
}

function recordDate(value: string) {
  return new Date(`${value}T12:00:00`).getTime();
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="關閉"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "green",
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "green" | "amber" | "blue" | "coral";
  icon: React.ReactNode;
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function QuantityPills({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  if (!entries.length) return <span className="muted">—</span>;
  return (
    <div className="quantity-pills">
      {entries.map(([unit, value]) => (
        <span className="quantity-pill" key={unit}>
          {formatNumber(value)} {unit}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`status-badge status-${tone}`}>
      <i />
      {children}
    </span>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [data, setData] = useState<AppData>(emptyData);
  const [connected, setConnected] = useState(Boolean(getEndpoint()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingId, setEditingId] = useState("");
  const [editingRevision, setEditingRevision] = useState("");
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(todayISO());
  const [period, setPeriod] = useState<Period>("month");
  const [endpointInput, setEndpointInput] = useState(getEndpoint());
  const [productionForm, setProductionForm] = useState<ProductionDraft>({
    date: todayISO(),
    area: "",
    quality: "特級",
    quantity: "",
    unit: DEFAULT_UNITS[0],
    wasteQuantity: "0",
    note: "",
  });
  const [shipmentForm, setShipmentForm] = useState<ShipmentDraft>({
    date: todayISO(),
    intermediaryId: "",
    intermediaryName: "",
    quality: "特級",
    quantity: "",
    unit: DEFAULT_UNITS[0],
    unitPrice: "",
    freight: "0",
    otherFee: "0",
    paidAmount: "0",
    paymentStatus: "未收款",
    note: "",
  });
  const [intermediaryForm, setIntermediaryForm] = useState<IntermediaryDraft>({
    name: "",
    contactPerson: "",
    phone: "",
    defaultUnit: DEFAULT_UNITS[0],
    defaultPrice: "",
    note: "",
  });

  const units = useMemo(() => unitsFrom(data), [data]);
  const qualities = useMemo(() => qualitiesFrom(data), [data]);
  const productions = useMemo(
    () =>
      activeProductions(data).sort(
        (a, b) => recordDate(b.date) - recordDate(a.date)
      ),
    [data]
  );
  const shipments = useMemo(
    () =>
      activeShipments(data).sort(
        (a, b) => recordDate(b.date) - recordDate(a.date)
      ),
    [data]
  );
  const intermediaries = useMemo(
    () =>
      activeIntermediaries(data).sort((a, b) =>
        a.name.localeCompare(b.name, "zh-Hant")
      ),
    [data]
  );

  const monthProductions = useMemo(
    () => productions.filter(item => isSameMonth(item.date)),
    [productions]
  );
  const monthShipments = useMemo(
    () => shipments.filter(item => isSameMonth(item.date)),
    [shipments]
  );
  const periodProductions = useMemo(
    () => productions.filter(item => isWithinPeriod(item.date, period, anchor)),
    [productions, period, anchor]
  );
  const periodShipments = useMemo(
    () => shipments.filter(item => isWithinPeriod(item.date, period, anchor)),
    [shipments, period, anchor]
  );
  const productionQuantity = useMemo(
    () => groupQuantity(monthProductions),
    [monthProductions]
  );
  const shipmentQuantity = useMemo(
    () => groupQuantity(monthShipments),
    [monthShipments]
  );
  const reportProductionQuantity = useMemo(
    () => groupQuantity(periodProductions),
    [periodProductions]
  );
  const reportShipmentQuantity = useMemo(
    () => groupQuantity(periodShipments),
    [periodShipments]
  );
  const reportRevenue = useMemo(
    () => amount(periodShipments),
    [periodShipments]
  );
  const reportAveragePrice = useMemo(() => {
    const totals = periodShipments.reduce(
      (result, item) => {
        result[item.unit] = result[item.unit] ?? { amount: 0, quantity: 0 };
        result[item.unit].amount += item.totalAmount;
        result[item.unit].quantity += item.quantity;
        return result;
      },
      {} as Record<string, { amount: number; quantity: number }>
    );
    return Object.fromEntries(
      Object.entries(totals).map(([unit, value]) => [
        unit,
        value.quantity ? value.amount / value.quantity : 0,
      ])
    );
  }, [periodShipments]);

  async function refresh(showNotice = false) {
    setLoading(true);
    setError("");
    try {
      const result = await loadData();
      setData(result.data);
      setConnected(result.connected);
      if (showNotice)
        setNotice(
          result.connected
            ? "已從 Google Sheets 重新載入資料。"
            : "目前使用示範模式，資料保存在此瀏覽器。 "
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "讀取資料失敗。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openProduction(record?: ProductionRecord) {
    setEditingId(record?.id ?? "");
    setEditingRevision(record?.revision ?? "");
    setProductionForm(
      record
        ? {
            date: record.date,
            area: record.area,
            quality: record.quality,
            quantity: String(record.quantity),
            unit: record.unit,
            wasteQuantity: String(record.wasteQuantity),
            note: record.note,
          }
        : {
            date: todayISO(),
            area: "",
            quality: qualities[0] ?? "一般",
            quantity: "",
            unit: units[0],
            wasteQuantity: "0",
            note: "",
          }
    );
    setModal("production");
  }

  function openShipment(record?: ShipmentRecord) {
    setEditingId(record?.id ?? "");
    setEditingRevision(record?.revision ?? "");
    setShipmentForm(
      record
        ? {
            date: record.date,
            intermediaryId: record.intermediaryId,
            intermediaryName: record.intermediaryName,
            quality: record.quality,
            quantity: String(record.quantity),
            unit: record.unit,
            unitPrice: String(record.unitPrice),
            freight: String(record.freight),
            otherFee: String(record.otherFee),
            paidAmount: String(record.paidAmount),
            paymentStatus: record.paymentStatus,
            note: record.note,
          }
        : {
            date: todayISO(),
            intermediaryId: intermediaries[0]?.id ?? "",
            intermediaryName: intermediaries[0]?.name ?? "",
            quality: qualities[0] ?? "一般",
            quantity: "",
            unit: intermediaries[0]?.defaultUnit ?? units[0],
            unitPrice: intermediaries[0]?.defaultPrice
              ? String(intermediaries[0].defaultPrice)
              : "",
            freight: "0",
            otherFee: "0",
            paidAmount: "0",
            paymentStatus: "未收款",
            note: "",
          }
    );
    setModal("shipment");
  }

  function openIntermediary(record?: Intermediary) {
    setEditingId(record?.id ?? "");
    setEditingRevision(record?.revision ?? "");
    setIntermediaryForm(
      record
        ? {
            name: record.name,
            contactPerson: record.contactPerson,
            phone: record.phone,
            defaultUnit: record.defaultUnit,
            defaultPrice: String(record.defaultPrice || ""),
            note: record.note,
          }
        : {
            name: "",
            contactPerson: "",
            phone: "",
            defaultUnit: units[0],
            defaultPrice: "",
            note: "",
          }
    );
    setModal("intermediary");
  }

  async function submitMutation(
    input: Parameters<typeof mutate>[0],
    successMessage: string
  ) {
    setSaving(true);
    setError("");
    try {
      const result = await mutate(input);
      if (result.data) setData(result.data);
      setConnected(result.connected);
      setModal(null);
      setNotice(
        `${successMessage}${result.connected ? " 已同步至 Google Sheets。" : " 已保存於示範模式。"}`
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  function submitProduction(event: React.FormEvent) {
    event.preventDefault();
    const quantity = Number(productionForm.quantity);
    if (!productionForm.date || !Number.isFinite(quantity) || quantity <= 0)
      return setError("請輸入正確的出產日期與數量。");
    const record = {
      ...productionForm,
      quantity,
      wasteQuantity: Number(productionForm.wasteQuantity || 0),
    };
    void submitMutation(
      {
        action: editingId ? "edit" : "add",
        entity: "production",
        id: editingId || undefined,
        revision: editingRevision || undefined,
        record,
      },
      editingId ? "出產紀錄已更新。" : "出產紀錄已新增。"
    );
  }

  function submitShipment(event: React.FormEvent) {
    event.preventDefault();
    const quantity = Number(shipmentForm.quantity);
    const unitPrice = Number(shipmentForm.unitPrice);
    const intermediary = intermediaries.find(
      item => item.id === shipmentForm.intermediaryId
    );
    if (
      !shipmentForm.date ||
      !intermediary ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    )
      return setError("請完成日期、中間商、數量與單價。");
    const record = {
      ...shipmentForm,
      intermediaryName: intermediary.name,
      quantity,
      unitPrice,
      freight: Number(shipmentForm.freight || 0),
      otherFee: Number(shipmentForm.otherFee || 0),
      paidAmount: Number(shipmentForm.paidAmount || 0),
    };
    void submitMutation(
      {
        action: editingId ? "edit" : "add",
        entity: "shipment",
        id: editingId || undefined,
        revision: editingRevision || undefined,
        record,
      },
      editingId ? "出貨紀錄已更新。" : "出貨紀錄已新增。"
    );
  }

  function submitIntermediary(event: React.FormEvent) {
    event.preventDefault();
    if (!intermediaryForm.name.trim()) return setError("請輸入中間商名稱。");
    const record = {
      ...intermediaryForm,
      defaultPrice: Number(intermediaryForm.defaultPrice || 0),
    };
    void submitMutation(
      {
        action: editingId ? "edit" : "add",
        entity: "intermediary",
        id: editingId || undefined,
        revision: editingRevision || undefined,
        record,
      },
      editingId ? "中間商資料已更新。" : "中間商已新增。"
    );
  }

  async function softDelete(
    entity: "production" | "shipment" | "intermediary",
    id: string,
    revision: string,
    label: string
  ) {
    if (!window.confirm(`確定要將這筆${label}作廢嗎？歷史資料仍會保留。`))
      return;
    await submitMutation(
      { action: "delete", entity, id, revision },
      `${label}已作廢。`
    );
  }

  function connectSheets() {
    try {
      setEndpoint(endpointInput);
      setNotice(
        endpointInput.trim()
          ? "連線網址已保存，正在測試 Google Sheets…"
          : "已切回示範模式。 "
      );
      void refresh(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "連線網址格式不正確。"
      );
    }
  }

  function exportReport(
    productionRows = periodProductions,
    shipmentRows = periodShipments
  ) {
    const rows = [
      ...productionRows.map(item => ({
        類別: "出產",
        日期: item.date,
        中間商: "—",
        品質等級: item.quality,
        數量: item.quantity,
        單位: item.unit,
        單價: "—",
        金額: "—",
        備註: item.note,
      })),
      ...shipmentRows.map(item => ({
        類別: "出貨",
        日期: item.date,
        中間商: item.intermediaryName,
        品質等級: item.quality,
        數量: item.quantity,
        單位: item.unit,
        單價: item.unitPrice,
        金額: item.totalAmount,
        備註: item.note,
      })),
    ];
    downloadCsv(
      `荖葉${period === "week" ? "週" : period === "month" ? "月" : "年"}統計-${anchor}.csv`,
      rows
    );
    setNotice("報表 CSV 已開始下載。 ");
  }

  const navItems: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "總覽", icon: <BarChart3 size={18} /> },
    { id: "production", label: "每日出產", icon: <Leaf size={18} /> },
    { id: "shipment", label: "出貨管理", icon: <Truck size={18} /> },
    { id: "intermediary", label: "中間商", icon: <Users size={18} /> },
    { id: "report", label: "統計報表", icon: <BookOpen size={18} /> },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <Leaf size={22} strokeWidth={2.6} />
          </div>
          <div>
            <strong>荖葉工作台</strong>
            <span>FIELD & FLOW</span>
          </div>
        </div>
        <div className="season-note">
          <span className="season-dot" /> 今日 {dateLabel(todayISO())}
          <br />
          <small>把田間數字，變成安心的決策。</small>
        </div>
        <nav className="side-nav" aria-label="主要功能">
          <span className="nav-label">工作區</span>
          {navItems.map(item => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setView(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {view === item.id && <ChevronRight size={15} />}
            </button>
          ))}
          <span className="nav-label nav-label-bottom">管理</span>
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setView("settings")}
          >
            <Settings2 size={18} />
            <span>系統設定</span>
            {view === "settings" && <ChevronRight size={15} />}
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="leaf-line" />
          <p>
            多單位分開統計
            <br />
            數字才不會失真。
          </p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <img
              className="mobile-brand-image"
              src={`${import.meta.env.BASE_URL}images/laoye-leaves.png`}
              alt=""
              width={40}
              height={40}
              decoding="async"
            />
            <strong>荖葉工作台</strong>
          </div>
          <div className="breadcrumb">
            <span>荖葉管理</span>
            <ChevronRight size={14} />
            <strong>
              {navItems.find(item => item.id === view)?.label ?? "系統設定"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span
              className={
                connected ? "connection-pill connected" : "connection-pill demo"
              }
            >
              <i />
              {connected ? "已連接 Sheets" : "示範模式"}
            </span>
            <button
              className="icon-button refresh-button"
              type="button"
              onClick={() => void refresh(true)}
              aria-label="重新整理"
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="mobile-menu icon-button"
              type="button"
              onClick={() => setMobileNavOpen(open => !open)}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-function-nav"
            >
              <Menu size={18} />
              功能選單
            </button>
          </div>
        </header>

        {mobileNavOpen && (
          <nav
            id="mobile-function-nav"
            className="mobile-function-nav"
            aria-label="手機功能選單"
          >
            {[
              ...navItems,
              {
                id: "settings" as View,
                label: "系統設定",
                icon: <Settings2 size={20} />,
              },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "active" : ""}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  setView(item.id);
                  setMobileNavOpen(false);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        )}

        {error && (
          <div className="alert-banner error">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert-banner success">
            <Check size={17} />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <RefreshCw className="spin" size={26} />
            <p>正在整理田間資料…</p>
          </div>
        ) : (
          <>
            {view === "dashboard" && (
              <DashboardView
                data={data}
                productionQuantity={productionQuantity}
                shipmentQuantity={shipmentQuantity}
                monthProductions={monthProductions}
                monthShipments={monthShipments}
                onAddProduction={() => openProduction()}
                onAddShipment={() => openShipment()}
                onViewReport={() => setView("report")}
              />
            )}
            {view === "production" && (
              <ProductionView
                records={productions}
                units={units}
                qualities={qualities}
                query={query}
                setQuery={setQuery}
                onAdd={() => openProduction()}
                onEdit={openProduction}
                onDelete={record =>
                  void softDelete(
                    "production",
                    record.id,
                    record.revision,
                    "出產紀錄"
                  )
                }
                onExport={() =>
                  downloadCsv(
                    "荖葉出產紀錄.csv",
                    productions.map(item => ({
                      日期: item.date,
                      區域: item.area,
                      品質等級: item.quality,
                      數量: item.quantity,
                      單位: item.unit,
                      報廢數量: item.wasteQuantity,
                      備註: item.note,
                    }))
                  )
                }
              />
            )}
            {view === "shipment" && (
              <ShipmentView
                records={shipments}
                units={units}
                qualities={qualities}
                intermediaries={intermediaries}
                query={query}
                setQuery={setQuery}
                onAdd={() => openShipment()}
                onEdit={openShipment}
                onDelete={record =>
                  void softDelete(
                    "shipment",
                    record.id,
                    record.revision,
                    "出貨紀錄"
                  )
                }
                onExport={() =>
                  downloadCsv(
                    "荖葉出貨紀錄.csv",
                    shipments.map(item => ({
                      日期: item.date,
                      出貨單號: item.shipmentNo,
                      中間商: item.intermediaryName,
                      品質等級: item.quality,
                      數量: item.quantity,
                      單位: item.unit,
                      單價: item.unitPrice,
                      出貨金額: item.totalAmount,
                      應收金額: item.receivableAmount,
                      收款狀態: item.paymentStatus,
                      備註: item.note,
                    }))
                  )
                }
              />
            )}
            {view === "intermediary" && (
              <IntermediaryView
                records={intermediaries}
                query={query}
                setQuery={setQuery}
                onAdd={() => openIntermediary()}
                onEdit={openIntermediary}
                onDelete={record =>
                  void softDelete(
                    "intermediary",
                    record.id,
                    record.revision,
                    "中間商"
                  )
                }
              />
            )}
            {view === "report" && (
              <ReportView
                period={period}
                setPeriod={setPeriod}
                anchor={anchor}
                setAnchor={setAnchor}
                units={units}
                qualities={qualities}
                intermediaries={intermediaries}
                productionRecords={periodProductions}
                shipmentRecords={periodShipments}
                onExport={exportReport}
              />
            )}
            {view === "settings" && (
              <SettingsView
                endpoint={endpointInput}
                setEndpoint={setEndpointInput}
                connected={connected}
                onConnect={connectSheets}
                onClear={() => {
                  setEndpointInput("");
                  setEndpoint("");
                  void refresh(true);
                }}
              />
            )}
          </>
        )}
      </main>

      {modal === "production" && (
        <Modal
          title={editingId ? "編輯出產紀錄" : "新增今日出產"}
          eyebrow="每日出產"
          onClose={() => setModal(null)}
        >
          <form className="form-grid" onSubmit={submitProduction}>
            <div className="field">
              <label>
                出產日期 <b>*</b>
              </label>
              <input
                type="date"
                value={productionForm.date}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    date: event.target.value,
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label>區域／田區</label>
              <input
                placeholder="例如：東側一區"
                value={productionForm.area}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    area: event.target.value,
                  })
                }
              />
            </div>
            <div className="field">
              <label>品質等級</label>
              <select
                value={productionForm.quality}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    quality: event.target.value,
                  })
                }
              >
                {qualities.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                數量單位 <b>*</b>
              </label>
              <select
                value={productionForm.unit}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    unit: event.target.value,
                  })
                }
              >
                {units.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                出產數量 <b>*</b>
              </label>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={productionForm.quantity}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    quantity: event.target.value,
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label>報廢數量</label>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={productionForm.wasteQuantity}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    wasteQuantity: event.target.value,
                  })
                }
              />
            </div>
            <div className="field full">
              <label>備註</label>
              <textarea
                rows={3}
                placeholder="記下天氣、採收狀況或品質備註"
                value={productionForm.note}
                onChange={event =>
                  setProductionForm({
                    ...productionForm,
                    note: event.target.value,
                  })
                }
              />
            </div>
            <div className="form-hint full">
              <Leaf size={16} /> 本筆會以「{productionForm.unit || "未選單位"}
              」獨立統計，不會和其他單位相加。
            </div>
            <div className="form-actions full">
              <button
                className="button secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "同步中…" : editingId ? "儲存修改" : "新增出產"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "shipment" && (
        <Modal
          title={editingId ? "編輯出貨紀錄" : "建立出貨紀錄"}
          eyebrow="出貨管理"
          onClose={() => setModal(null)}
        >
          <form className="form-grid" onSubmit={submitShipment}>
            <div className="field">
              <label>
                出貨日期 <b>*</b>
              </label>
              <input
                type="date"
                value={shipmentForm.date}
                onChange={event =>
                  setShipmentForm({ ...shipmentForm, date: event.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label>
                中間商 <b>*</b>
              </label>
              <select
                value={shipmentForm.intermediaryId}
                onChange={event => {
                  const item = intermediaries.find(
                    row => row.id === event.target.value
                  );
                  setShipmentForm({
                    ...shipmentForm,
                    intermediaryId: event.target.value,
                    intermediaryName: item?.name ?? "",
                    unit: item?.defaultUnit ?? shipmentForm.unit,
                    unitPrice: item?.defaultPrice
                      ? String(item.defaultPrice)
                      : shipmentForm.unitPrice,
                  });
                }}
              >
                <option value="">請選擇中間商</option>
                {intermediaries.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>品質等級</label>
              <select
                value={shipmentForm.quality}
                onChange={event =>
                  setShipmentForm({
                    ...shipmentForm,
                    quality: event.target.value,
                  })
                }
              >
                {qualities.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                出貨單位 <b>*</b>
              </label>
              <select
                value={shipmentForm.unit}
                onChange={event =>
                  setShipmentForm({ ...shipmentForm, unit: event.target.value })
                }
              >
                {units.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                出貨數量 <b>*</b>
              </label>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={shipmentForm.quantity}
                onChange={event =>
                  setShipmentForm({
                    ...shipmentForm,
                    quantity: event.target.value,
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label>
                每單位單價 <b>*</b>
              </label>
              <div className="input-prefix">
                <span>NT$</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={shipmentForm.unitPrice}
                  onChange={event =>
                    setShipmentForm({
                      ...shipmentForm,
                      unitPrice: event.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>
            <div className="field">
              <label>運費</label>
              <div className="input-prefix">
                <span>NT$</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipmentForm.freight}
                  onChange={event =>
                    setShipmentForm({
                      ...shipmentForm,
                      freight: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>其他費用</label>
              <div className="input-prefix">
                <span>NT$</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipmentForm.otherFee}
                  onChange={event =>
                    setShipmentForm({
                      ...shipmentForm,
                      otherFee: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>已收款</label>
              <div className="input-prefix">
                <span>NT$</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipmentForm.paidAmount}
                  onChange={event =>
                    setShipmentForm({
                      ...shipmentForm,
                      paidAmount: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>收款狀態</label>
              <select
                value={shipmentForm.paymentStatus}
                onChange={event =>
                  setShipmentForm({
                    ...shipmentForm,
                    paymentStatus: event.target.value,
                  })
                }
              >
                <option>未收款</option>
                <option>部分收款</option>
                <option>已收款</option>
              </select>
            </div>
            <div className="shipment-total full">
              <span>預估出貨金額</span>
              <strong>
                {formatMoney(
                  (Number(shipmentForm.quantity) || 0) *
                    (Number(shipmentForm.unitPrice) || 0)
                )}
              </strong>
              <small>
                {shipmentForm.unit || "—"} × 每單位單價；系統自動計算
              </small>
            </div>
            <div className="field full">
              <label>備註</label>
              <textarea
                rows={3}
                placeholder="記下交易條件或交貨說明"
                value={shipmentForm.note}
                onChange={event =>
                  setShipmentForm({ ...shipmentForm, note: event.target.value })
                }
              />
            </div>
            <div className="form-hint full">
              <CircleAlert size={16} />{" "}
              價格可依中間商、品質等級與出貨日期逐筆不同，本筆單價會獨立保存。
            </div>
            <div className="form-actions full">
              <button
                className="button secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "同步中…" : editingId ? "儲存修改" : "建立出貨單"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "intermediary" && (
        <Modal
          title={editingId ? "編輯中間商" : "新增中間商"}
          eyebrow="中間商管理"
          onClose={() => setModal(null)}
        >
          <form className="form-grid" onSubmit={submitIntermediary}>
            <div className="field full">
              <label>
                中間商名稱 <b>*</b>
              </label>
              <input
                placeholder="例如：青田行"
                value={intermediaryForm.name}
                onChange={event =>
                  setIntermediaryForm({
                    ...intermediaryForm,
                    name: event.target.value,
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label>聯絡人</label>
              <input
                placeholder="姓名"
                value={intermediaryForm.contactPerson}
                onChange={event =>
                  setIntermediaryForm({
                    ...intermediaryForm,
                    contactPerson: event.target.value,
                  })
                }
              />
            </div>
            <div className="field">
              <label>電話</label>
              <input
                type="tel"
                placeholder="09xx-xxx-xxx"
                value={intermediaryForm.phone}
                onChange={event =>
                  setIntermediaryForm({
                    ...intermediaryForm,
                    phone: event.target.value,
                  })
                }
              />
            </div>
            <div className="field">
              <label>慣用單位</label>
              <select
                value={intermediaryForm.defaultUnit}
                onChange={event =>
                  setIntermediaryForm({
                    ...intermediaryForm,
                    defaultUnit: event.target.value,
                  })
                }
              >
                {units.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>預設單價</label>
              <div className="input-prefix">
                <span>NT$</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="可不填"
                  value={intermediaryForm.defaultPrice}
                  onChange={event =>
                    setIntermediaryForm({
                      ...intermediaryForm,
                      defaultPrice: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="field full">
              <label>備註</label>
              <textarea
                rows={3}
                placeholder="付款習慣、收貨日或品質要求"
                value={intermediaryForm.note}
                onChange={event =>
                  setIntermediaryForm({
                    ...intermediaryForm,
                    note: event.target.value,
                  })
                }
              />
            </div>
            <div className="form-hint full">
              <Users size={16} />{" "}
              預設單位與單價只會在新增出貨時帶入，仍可依日期與品質調整。
            </div>
            <div className="form-actions full">
              <button
                className="button secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "同步中…" : editingId ? "儲存修改" : "新增中間商"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

function DashboardView({
  data,
  productionQuantity,
  shipmentQuantity,
  monthProductions,
  monthShipments,
  onAddProduction,
  onAddShipment,
  onViewReport,
}: {
  data: AppData;
  productionQuantity: Record<string, number>;
  shipmentQuantity: Record<string, number>;
  monthProductions: ProductionRecord[];
  monthShipments: ShipmentRecord[];
  onAddProduction: () => void;
  onAddShipment: () => void;
  onViewReport: () => void;
}) {
  const recent = [
    ...monthProductions.map(item => ({
      type: "出產",
      date: item.date,
      label: `${item.quality}・${item.area || "未填區域"}`,
      quantity: `${formatNumber(item.quantity)} ${item.unit}`,
      amount: "—",
    })),
    ...monthShipments.map(item => ({
      type: "出貨",
      date: item.date,
      label: `${item.intermediaryName}・${item.quality}`,
      quantity: `${formatNumber(item.quantity)} ${item.unit}`,
      amount: formatMoney(item.totalAmount),
    })),
  ]
    .sort((a, b) => recordDate(b.date) - recordDate(a.date))
    .slice(0, 5);
  const revenue = amount(monthShipments);
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="本月田間摘要"
        title="今天收成多少？"
        description="把出產、出貨與價格放在同一個視線裡，今天的數字今天掌握。"
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              onClick={onAddProduction}
            >
              <Plus size={17} />
              記錄出產
            </button>
            <button
              className="button primary"
              type="button"
              onClick={onAddShipment}
            >
              <Truck size={17} />
              建立出貨單
            </button>
          </>
        }
      />
      <div className="demo-ribbon">
        <span className="ribbon-icon">
          {data.settings.timezone ? <Cloud size={16} /> : <Link2 size={16} />}
        </span>
        <div>
          <strong>
            {getEndpoint() ? "已連接你的 Google Sheets" : "目前是示範模式"}
          </strong>
          <p>
            {getEndpoint()
              ? "新增資料會同步到試算表；統計會依工作表中的有效紀錄更新。"
              : "先用示範資料熟悉流程；到系統設定貼上 Apps Script /exec 網址即可連線。"}
          </p>
        </div>
        <button type="button" onClick={onViewReport}>
          查看統計 <ChevronRight size={15} />
        </button>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="本月出產"
          value={quantitySummary(productionQuantity)}
          detail={`${monthProductions.length} 筆有效紀錄・分單位顯示`}
          tone="green"
          icon={<Leaf size={20} />}
        />
        <MetricCard
          label="本月出貨"
          value={quantitySummary(shipmentQuantity)}
          detail={`${monthShipments.length} 張出貨單`}
          tone="blue"
          icon={<Truck size={20} />}
        />
        <MetricCard
          label="本月營收"
          value={formatMoney(revenue)}
          detail="出貨金額合計，不含成本"
          tone="amber"
          icon={<BarChart3 size={20} />}
        />
        <MetricCard
          label="啟用中間商"
          value={`${activeIntermediaries(data).length} 家`}
          detail="可直接帶入預設單價"
          tone="coral"
          icon={<Users size={20} />}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel panel-chart">
          <div className="panel-head">
            <div>
              <span className="eyebrow">UNIT AWARE</span>
              <h2>本月單位分布</h2>
            </div>
            <span className="panel-note">不同單位不混算</span>
          </div>
          <div className="unit-bars">
            {Object.entries(productionQuantity).length ? (
              Object.entries(productionQuantity).map(([unit, value]) => {
                const max = Math.max(...Object.values(productionQuantity));
                return (
                  <div className="unit-row" key={unit}>
                    <div className="unit-label">
                      <span>{unit}</span>
                      <strong>{formatNumber(value)}</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(8, (value / max) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-inline">這個月份還沒有出產資料。</div>
            )}
          </div>
          <div className="chart-footer">
            <span>
              <i className="legend-dot green" />
              出產
            </span>
            <span>
              <i className="legend-dot sage" />
              系統不自動換算
            </span>
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">QUICK ENTRY</span>
              <h2>快速記錄</h2>
            </div>
          </div>
          <button
            type="button"
            className="quick-action"
            onClick={onAddProduction}
          >
            <span className="quick-icon green-bg">
              <Leaf size={19} />
            </span>
            <span>
              <strong>新增出產</strong>
              <small>記錄今日採收數量</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            className="quick-action"
            onClick={onAddShipment}
          >
            <span className="quick-icon blue-bg">
              <PackagePlus size={19} />
            </span>
            <span>
              <strong>建立出貨</strong>
              <small>依中間商與品質填價格</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button type="button" className="quick-action" onClick={onViewReport}>
            <span className="quick-icon amber-bg">
              <BookOpen size={19} />
            </span>
            <span>
              <strong>查看報表</strong>
              <small>週、月、年統計</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">LATEST MOVEMENT</span>
            <h2>本月最新動態</h2>
          </div>
          <button className="text-button" type="button" onClick={onViewReport}>
            查看完整報表 <ChevronRight size={15} />
          </button>
        </div>
        {recent.length ? (
          <div className="activity-table">
            <div className="activity-row activity-head">
              <span>類型</span>
              <span>日期</span>
              <span>內容</span>
              <span>數量</span>
              <span>金額</span>
            </div>
            {recent.map((item, index) => (
              <div
                className="activity-row"
                key={`${item.date}-${item.label}-${index}`}
              >
                <span>
                  <StatusBadge
                    tone={item.type === "出貨" ? "warning" : "success"}
                  >
                    {item.type}
                  </StatusBadge>
                </span>
                <span>{dateLabel(item.date)}</span>
                <span className="strong-cell">{item.label}</span>
                <span>{item.quantity}</span>
                <span className="money-cell">{item.amount}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Leaf size={23} />
            <p>尚無本月資料，先記錄第一筆吧。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProductionView({
  records,
  units,
  qualities,
  query,
  setQuery,
  onAdd,
  onEdit,
  onDelete,
  onExport,
}: {
  records: ProductionRecord[];
  units: string[];
  qualities: string[];
  query: string;
  setQuery: (value: string) => void;
  onAdd: () => void;
  onEdit: (record: ProductionRecord) => void;
  onDelete: (record: ProductionRecord) => void;
  onExport: () => void;
}) {
  const [unitFilter, setUnitFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      records.filter(item => {
        const textMatch =
          `${item.date} ${item.area} ${item.quality} ${item.unit} ${item.note}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return (
          textMatch &&
          (!unitFilter || item.unit === unitFilter) &&
          (!qualityFilter || item.quality === qualityFilter) &&
          (!from || item.date >= from) &&
          (!to || item.date <= to)
        );
      }),
    [records, query, unitFilter, qualityFilter, from, to]
  );
  const clearFilters = () => {
    setQuery("");
    setUnitFilter("");
    setQualityFilter("");
    setFrom("");
    setTo("");
  };
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="FIELD NOTES"
        title="每日出產"
        description="先記錄田裡真正發生的事，單位保留原貌，之後的統計才可信。"
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              onClick={onExport}
            >
              <Download size={17} />
              匯出 CSV
            </button>
            <button className="button primary" type="button" onClick={onAdd}>
              <Plus size={17} />
              新增出產
            </button>
          </>
        }
      />
      <div className="filter-bar filter-bar-stack">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="搜尋日期、區域、品質或備註"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select
            className="filter-control"
            value={unitFilter}
            onChange={event => setUnitFilter(event.target.value)}
          >
            <option value="">全部單位</option>
            {units.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="filter-control"
            value={qualityFilter}
            onChange={event => setQualityFilter(event.target.value)}
          >
            <option value="">全部品質</option>
            {qualities.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            className="filter-control date-control"
            type="date"
            aria-label="起始日期"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
          <input
            className="filter-control date-control"
            type="date"
            aria-label="結束日期"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
          <button className="filter-clear" type="button" onClick={clearFilters}>
            清除篩選
          </button>
        </div>
        <span className="result-count">{filtered.length} 筆有效紀錄</span>
      </div>
      <section className="panel data-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>區域</th>
                <th>品質</th>
                <th>出產數量</th>
                <th>報廢</th>
                <th>備註</th>
                <th className="action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <tr key={record.id}>
                  <td data-label="日期" className="date-cell">
                    {dateLabel(record.date)}
                  </td>
                  <td data-label="區域" className="strong-cell">
                    {record.area || "未填區域"}
                  </td>
                  <td data-label="品質">
                    <span className="quality-tag">{record.quality}</span>
                  </td>
                  <td data-label="出產數量">
                    <strong>{formatNumber(record.quantity)}</strong>{" "}
                    <span className="unit-text">{record.unit}</span>
                  </td>
                  <td data-label="報廢">
                    {record.wasteQuantity
                      ? `${formatNumber(record.wasteQuantity)} ${record.unit}`
                      : "—"}
                  </td>
                  <td data-label="備註" className="note-cell">
                    {record.note || "—"}
                  </td>
                  <td data-label="操作" className="row-actions">
                    <button type="button" onClick={() => onEdit(record)}>
                      編輯
                    </button>
                    <button type="button" onClick={() => onDelete(record)}>
                      作廢
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <Leaf size={24} />
            <p>找不到符合條件的出產紀錄。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ShipmentView({
  records,
  units,
  qualities,
  intermediaries,
  query,
  setQuery,
  onAdd,
  onEdit,
  onDelete,
  onExport,
}: {
  records: ShipmentRecord[];
  units: string[];
  qualities: string[];
  intermediaries: Intermediary[];
  query: string;
  setQuery: (value: string) => void;
  onAdd: () => void;
  onEdit: (record: ShipmentRecord) => void;
  onDelete: (record: ShipmentRecord) => void;
  onExport: () => void;
}) {
  const [unitFilter, setUnitFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [intermediaryFilter, setIntermediaryFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      records.filter(item => {
        const textMatch =
          `${item.date} ${item.shipmentNo} ${item.intermediaryName} ${item.quality} ${item.unit} ${item.paymentStatus}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return (
          textMatch &&
          (!unitFilter || item.unit === unitFilter) &&
          (!qualityFilter || item.quality === qualityFilter) &&
          (!intermediaryFilter || item.intermediaryId === intermediaryFilter) &&
          (!from || item.date >= from) &&
          (!to || item.date <= to)
        );
      }),
    [records, query, unitFilter, qualityFilter, intermediaryFilter, from, to]
  );
  const clearFilters = () => {
    setQuery("");
    setUnitFilter("");
    setQualityFilter("");
    setIntermediaryFilter("");
    setFrom("");
    setTo("");
  };
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="OUTBOUND FLOW"
        title="出貨管理"
        description="每一筆單價都可以不同，價格會跟著中間商、品質與日期留下來。"
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              onClick={onExport}
            >
              <Download size={17} />
              匯出 CSV
            </button>
            <button className="button primary" type="button" onClick={onAdd}>
              <Plus size={17} />
              建立出貨單
            </button>
          </>
        }
      />
      <div className="filter-bar filter-bar-stack">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="搜尋單號、中間商、品質或收款狀態"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select
            className="filter-control intermediary-control"
            value={intermediaryFilter}
            onChange={event => setIntermediaryFilter(event.target.value)}
          >
            <option value="">全部中間商</option>
            {intermediaries.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="filter-control"
            value={unitFilter}
            onChange={event => setUnitFilter(event.target.value)}
          >
            <option value="">全部單位</option>
            {units.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="filter-control"
            value={qualityFilter}
            onChange={event => setQualityFilter(event.target.value)}
          >
            <option value="">全部品質</option>
            {qualities.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            className="filter-control date-control"
            type="date"
            aria-label="起始日期"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
          <input
            className="filter-control date-control"
            type="date"
            aria-label="結束日期"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
          <button className="filter-clear" type="button" onClick={clearFilters}>
            清除篩選
          </button>
        </div>
        <span className="result-count">{filtered.length} 張有效出貨單</span>
      </div>
      <section className="panel data-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期／單號</th>
                <th>中間商</th>
                <th>品質</th>
                <th>數量</th>
                <th>單價</th>
                <th>出貨金額</th>
                <th>收款</th>
                <th className="action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <tr key={record.id}>
                  <td data-label="日期／單號">
                    <span className="date-cell">{dateLabel(record.date)}</span>
                    <small className="sub-cell">{record.shipmentNo}</small>
                  </td>
                  <td data-label="中間商" className="strong-cell">
                    {record.intermediaryName}
                  </td>
                  <td data-label="品質">
                    <span className="quality-tag">{record.quality}</span>
                  </td>
                  <td data-label="數量">
                    <strong>{formatNumber(record.quantity)}</strong>{" "}
                    <span className="unit-text">{record.unit}</span>
                  </td>
                  <td data-label="單價">
                    {formatMoney(record.unitPrice)}
                    <small className="sub-cell">/{record.unit}</small>
                  </td>
                  <td data-label="出貨金額" className="money-cell">
                    {formatMoney(record.totalAmount)}
                  </td>
                  <td data-label="收款">
                    <StatusBadge
                      tone={
                        record.paymentStatus === "已收款"
                          ? "success"
                          : record.paymentStatus === "部分收款"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {record.paymentStatus}
                    </StatusBadge>
                  </td>
                  <td data-label="操作" className="row-actions">
                    <button type="button" onClick={() => onEdit(record)}>
                      編輯
                    </button>
                    <button type="button" onClick={() => onDelete(record)}>
                      作廢
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <Truck size={24} />
            <p>找不到符合條件的出貨紀錄。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function IntermediaryView({
  records,
  query,
  setQuery,
  onAdd,
  onEdit,
  onDelete,
}: {
  records: Intermediary[];
  query: string;
  setQuery: (value: string) => void;
  onAdd: () => void;
  onEdit: (record: Intermediary) => void;
  onDelete: (record: Intermediary) => void;
}) {
  const filtered = records.filter(item =>
    `${item.name} ${item.contactPerson} ${item.phone} ${item.defaultUnit} ${item.note}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="PARTNERS"
        title="中間商"
        description="把交易對象整理好，出貨時就能快速帶入慣用單位與預設單價。"
        actions={
          <button className="button primary" type="button" onClick={onAdd}>
            <Plus size={17} />
            新增中間商
          </button>
        }
      />
      <div className="filter-bar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="搜尋名稱、聯絡人或電話"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <span className="result-count">{filtered.length} 家啟用中間商</span>
      </div>
      <div className="partner-grid">
        {filtered.map(record => (
          <article className="partner-card" key={record.id}>
            <div className="partner-top">
              <div className="partner-avatar">
                <Store size={19} />
              </div>
              <div>
                <h3>{record.name}</h3>
                <StatusBadge tone="success">啟用</StatusBadge>
              </div>
              <button
                className="more-button"
                type="button"
                onClick={() => onEdit(record)}
              >
                編輯
              </button>
            </div>
            <div className="partner-info">
              <span>
                <Users size={14} />
                {record.contactPerson || "未填聯絡人"}
              </span>
              <span>
                <Truck size={14} />
                {record.phone || "未填電話"}
              </span>
            </div>
            <div className="partner-default">
              <div>
                <small>慣用單位</small>
                <strong>{record.defaultUnit}</strong>
              </div>
              <div>
                <small>預設單價</small>
                <strong>
                  {record.defaultPrice
                    ? formatMoney(record.defaultPrice)
                    : "未設定"}
                </strong>
              </div>
            </div>
            {record.note && <p className="partner-note">{record.note}</p>}
            <button
              className="partner-disable"
              type="button"
              onClick={() => onDelete(record)}
            >
              停用此中間商
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <section className="panel empty-state">
          <Users size={24} />
          <p>目前沒有符合條件的中間商。</p>
        </section>
      )}
    </div>
  );
}

function ReportView({
  period,
  setPeriod,
  anchor,
  setAnchor,
  units,
  qualities,
  intermediaries,
  productionRecords,
  shipmentRecords,
  onExport,
}: {
  period: Period;
  setPeriod: (value: Period) => void;
  anchor: string;
  setAnchor: (value: string) => void;
  units: string[];
  qualities: string[];
  intermediaries: Intermediary[];
  productionRecords: ProductionRecord[];
  shipmentRecords: ShipmentRecord[];
  onExport: (
    productions: ProductionRecord[],
    shipments: ShipmentRecord[]
  ) => void;
}) {
  const [unitFilter, setUnitFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [intermediaryFilter, setIntermediaryFilter] = useState("");
  const filteredProduction = useMemo(
    () =>
      productionRecords.filter(
        item =>
          (!unitFilter || item.unit === unitFilter) &&
          (!qualityFilter || item.quality === qualityFilter)
      ),
    [productionRecords, unitFilter, qualityFilter]
  );
  const filteredShipments = useMemo(
    () =>
      shipmentRecords.filter(
        item =>
          (!unitFilter || item.unit === unitFilter) &&
          (!qualityFilter || item.quality === qualityFilter) &&
          (!intermediaryFilter || item.intermediaryId === intermediaryFilter)
      ),
    [shipmentRecords, unitFilter, qualityFilter, intermediaryFilter]
  );
  const productionQuantity = useMemo(
    () => groupQuantity(filteredProduction),
    [filteredProduction]
  );
  const shipmentQuantity = useMemo(
    () => groupQuantity(filteredShipments),
    [filteredShipments]
  );
  const revenue = useMemo(() => amount(filteredShipments), [filteredShipments]);
  const averagePrice = useMemo(() => {
    const totals = filteredShipments.reduce(
      (result, item) => {
        result[item.unit] = result[item.unit] ?? { amount: 0, quantity: 0 };
        result[item.unit].amount += item.totalAmount;
        result[item.unit].quantity += item.quantity;
        return result;
      },
      {} as Record<string, { amount: number; quantity: number }>
    );
    return Object.fromEntries(
      Object.entries(totals).map(([unit, value]) => [
        unit,
        value.quantity ? value.amount / value.quantity : 0,
      ])
    );
  }, [filteredShipments]);
  const unitRows = Array.from(
    new Set([
      ...Object.keys(productionQuantity),
      ...Object.keys(shipmentQuantity),
    ])
  );
  const intermediaryRows = Object.entries(
    filteredShipments.reduce(
      (result, item) => {
        const key = item.intermediaryName || "未指定";
        result[key] = result[key] ?? { quantity: {}, amount: 0 };
        result[key].quantity[item.unit] =
          (result[key].quantity[item.unit] ?? 0) + item.quantity;
        result[key].amount += item.totalAmount;
        return result;
      },
      {} as Record<string, { quantity: Record<string, number>; amount: number }>
    )
  );
  const periodLabel =
    period === "week"
      ? `${dateLabel(startOfWeek(anchor))} — ${dateLabel(endOfWeek(anchor))}`
      : period === "month"
        ? `${anchor.slice(0, 7).replace("-", " 年 ")} 月`
        : `${anchor.slice(0, 4)} 年`;
  const clearFilters = () => {
    setUnitFilter("");
    setQualityFilter("");
    setIntermediaryFilter("");
  };
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="REPORTING RHYTHM"
        title="統計報表"
        description="週、月、年都可以看；不同單位始終分開，收入則依出貨金額合計。"
        actions={
          <button
            className="button primary"
            type="button"
            onClick={() => onExport(filteredProduction, filteredShipments)}
          >
            <Download size={17} />
            匯出此報表
          </button>
        }
      />
      <section className="report-toolbar">
        <div className="segmented-control">
          {(
            [
              ["week", "本週"],
              ["month", "本月"],
              ["year", "本年"],
            ] as Array<[Period, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              className={period === value ? "active" : ""}
              type="button"
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="report-filters">
          <select
            className="filter-control"
            value={unitFilter}
            onChange={event => setUnitFilter(event.target.value)}
          >
            <option value="">全部單位</option>
            {units.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="filter-control"
            value={qualityFilter}
            onChange={event => setQualityFilter(event.target.value)}
          >
            <option value="">全部品質</option>
            {qualities.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="filter-control intermediary-control"
            value={intermediaryFilter}
            onChange={event => setIntermediaryFilter(event.target.value)}
          >
            <option value="">全部中間商</option>
            {intermediaries.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button className="filter-clear" type="button" onClick={clearFilters}>
            清除篩選
          </button>
        </div>
        <label className="date-anchor">
          統計基準日{" "}
          <input
            type="date"
            value={anchor}
            onChange={event => setAnchor(event.target.value)}
          />
        </label>
      </section>
      <div className="report-title-row">
        <div>
          <span className="eyebrow">
            {period === "week"
              ? "WEEKLY"
              : period === "month"
                ? "MONTHLY"
                : "YEARLY"}
          </span>
          <h2>{periodLabel}</h2>
        </div>
        <span className="report-count">
          {filteredProduction.length + filteredShipments.length} 筆符合篩選
        </span>
      </div>
      <div className="metrics-grid report-metrics">
        <MetricCard
          label="出產總量"
          value={quantitySummary(productionQuantity)}
          detail="依單位分開統計"
          tone="green"
          icon={<Leaf size={20} />}
        />
        <MetricCard
          label="出貨總量"
          value={quantitySummary(shipmentQuantity)}
          detail={`${filteredShipments.length} 張出貨單`}
          tone="blue"
          icon={<Truck size={20} />}
        />
        <MetricCard
          label="出貨金額"
          value={formatMoney(revenue)}
          detail="出貨金額合計"
          tone="amber"
          icon={<BarChart3 size={20} />}
        />
        <MetricCard
          label="平均單價"
          value={
            Object.keys(averagePrice).length
              ? Object.entries(averagePrice)
                  .map(([unit, value]) => `${formatMoney(value)}/${unit}`)
                  .join(" · ")
              : "—"
          }
          detail="各單位分別計算"
          tone="coral"
          icon={<ShoppingCart size={20} />}
        />
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">BY UNIT</span>
              <h2>單位明細</h2>
            </div>
          </div>
          <div className="report-table">
            <div className="report-row report-head">
              <span>單位</span>
              <span>出產</span>
              <span>出貨</span>
              <span>出貨筆數</span>
            </div>
            {unitRows.map(unit => (
              <div className="report-row" key={unit}>
                <span className="strong-cell">{unit}</span>
                <span>{formatNumber(productionQuantity[unit] ?? 0)}</span>
                <span>{formatNumber(shipmentQuantity[unit] ?? 0)}</span>
                <span>
                  {filteredShipments.filter(item => item.unit === unit).length}{" "}
                  筆
                </span>
              </div>
            ))}
            {!unitRows.length && (
              <div className="empty-inline">此期間還沒有資料。</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">BY PARTNER</span>
              <h2>中間商交易</h2>
            </div>
          </div>
          <div className="report-table">
            <div className="report-row report-head">
              <span>中間商</span>
              <span>出貨量</span>
              <span>金額</span>
            </div>
            {intermediaryRows.map(([name, value]) => (
              <div className="report-row" key={name}>
                <span className="strong-cell">{name}</span>
                <span>
                  <QuantityPills values={value.quantity} />
                </span>
                <span className="money-cell">{formatMoney(value.amount)}</span>
              </div>
            ))}
            {!intermediaryRows.length && (
              <div className="empty-inline">此期間還沒有出貨資料。</div>
            )}
          </div>
        </section>
      </div>
      <p className="report-footnote">
        <CircleAlert size={15} />{" "}
        報表只計入有效資料；公斤、台斤、箱、把等單位不會直接混加，若未設定換算關係，系統只會並列呈現。
      </p>
    </div>
  );
}

function SettingsView({
  endpoint,
  setEndpoint,
  connected,
  onConnect,
  onClear,
}: {
  endpoint: string;
  setEndpoint: (value: string) => void;
  connected: boolean;
  onConnect: () => void;
  onClear: () => void;
}) {
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="SYSTEM SETTINGS"
        title="系統設定"
        description="管理 Google Sheets 連線與第一版的資料規則。"
      />
      <div className="settings-layout">
        <section className="panel settings-card">
          <div className="settings-title">
            <div className="settings-icon">
              <Link2 size={20} />
            </div>
            <div>
              <h2>Google Sheets 連線</h2>
              <p>
                {connected
                  ? "目前已連接 Apps Script Web App。"
                  : "尚未連接，使用者可先以示範資料操作。"}
              </p>
            </div>
          </div>
          <label className="field settings-field">
            <span>正式 Web App 網址</span>
            <input
              type="url"
              placeholder="https://script.google.com/macros/s/…/exec"
              value={endpoint}
              onChange={event => setEndpoint(event.target.value)}
            />
          </label>
          <div className="settings-actions">
            <button
              className="button primary"
              type="button"
              onClick={onConnect}
            >
              <RefreshCw size={16} />
              測試連線並載入資料
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={onClear}
            >
              清除並回到示範模式
            </button>
          </div>
          <div className="security-note">
            <CircleAlert size={17} />
            <div>
              <strong>請把 /exec 網址當成私密連結</strong>
              <p>
                任何取得這個網址的人都可能讀取、新增、編輯或作廢資料。試算表不需要公開，但這個第一版沒有登入或細緻權限。
              </p>
            </div>
          </div>
        </section>
        <section className="panel rules-card">
          <div className="panel-head">
            <div>
              <span className="eyebrow">DATA RULES</span>
              <h2>目前資料規則</h2>
            </div>
          </div>
          <div className="rule-item">
            <span className="rule-number">01</span>
            <div>
              <strong>多種單位並用</strong>
              <p>
                公斤、台斤、箱、把可同時記錄；統計時會分單位顯示，不直接相加。
              </p>
            </div>
          </div>
          <div className="rule-item">
            <span className="rule-number">02</span>
            <div>
              <strong>價格逐筆保存</strong>
              <p>
                單價隨中間商、品質等級與日期改變，每張出貨單都保留自己的單價。
              </p>
            </div>
          </div>
          <div className="rule-item">
            <span className="rule-number">03</span>
            <div>
              <strong>歷史資料不刪除</strong>
              <p>刪除動作會改為作廢，統計排除作廢資料，但歷史紀錄仍保留。</p>
            </div>
          </div>
        </section>
      </div>
      <section className="setup-guide">
        <div className="setup-step">
          <span>1</span>
          <strong>建立試算表</strong>
          <p>在 Apps Script 的 CONFIG 填入試算表 ID，執行 setup()。</p>
        </div>
        <div className="setup-step">
          <span>2</span>
          <strong>部署 Web App</strong>
          <p>執行身分選「我」，存取權選「任何人」，複製正式 /exec。</p>
        </div>
        <div className="setup-step">
          <span>3</span>
          <strong>貼回這裡</strong>
          <p>貼上網址並測試，前端只保存於目前瀏覽器。</p>
        </div>
      </section>
    </div>
  );
}
