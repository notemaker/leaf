export type RecordStatus = "有效" | "作廢";

export type ProductionRecord = {
  id: string;
  date: string;
  area: string;
  quality: string;
  quantity: number;
  unit: string;
  wasteQuantity: number;
  note: string;
  revision: string;
  status: RecordStatus;
  createdAt?: string;
};

export type ShipmentRecord = {
  id: string;
  date: string;
  shipmentNo: string;
  intermediaryId: string;
  intermediaryName: string;
  quality: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  freight: number;
  otherFee: number;
  receivableAmount: number;
  paidAmount: number;
  paymentStatus: string;
  note: string;
  revision: string;
  status: RecordStatus;
  createdAt?: string;
};

export type Intermediary = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  defaultUnit: string;
  defaultPrice: number;
  note: string;
  status: "啟用" | "停用";
  revision: string;
  createdAt?: string;
};

export type AppData = {
  productions: ProductionRecord[];
  shipments: ShipmentRecord[];
  intermediaries: Intermediary[];
  settings: Record<string, string>;
};

export type MutationInput = {
  action: "add" | "edit" | "delete";
  entity: "production" | "shipment" | "intermediary";
  record?: Partial<Record<string, unknown>>;
  id?: string;
  revision?: string;
};

export const DEFAULT_UNITS = ["公斤", "台斤", "箱", "把"];
export const DEFAULT_QUALITIES = ["特級", "A級", "B級", "一般"];

const ENDPOINT_KEY = "laoye-google-apps-script-url";
const DATA_KEY = "laoye-demo-data-v1";

export function todayISO() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function offsetDate(days: number) {
  const base = new Date(`${todayISO()}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedData(): AppData {
  const firstId = "demo-intermediary-1";
  const secondId = "demo-intermediary-2";
  return {
    intermediaries: [
      {
        id: firstId,
        name: "青田行",
        contactPerson: "林先生",
        phone: "0912-345-678",
        defaultUnit: "公斤",
        defaultPrice: 82,
        note: "每週二、五收貨",
        status: "啟用",
        revision: "1",
      },
      {
        id: secondId,
        name: "南風農產",
        contactPerson: "陳小姐",
        phone: "0988-765-432",
        defaultUnit: "台斤",
        defaultPrice: 48,
        note: "A級以上優先",
        status: "啟用",
        revision: "1",
      },
      {
        id: "demo-intermediary-3",
        name: "好葉商行",
        contactPerson: "",
        phone: "",
        defaultUnit: "箱",
        defaultPrice: 980,
        note: "",
        status: "停用",
        revision: "1",
      },
    ],
    productions: [
      {
        id: "demo-production-1",
        date: offsetDate(-1),
        area: "東側一區",
        quality: "特級",
        quantity: 86,
        unit: "公斤",
        wasteQuantity: 3,
        note: "早晨採收，葉況佳",
        revision: "1",
        status: "有效",
      },
      {
        id: "demo-production-2",
        date: offsetDate(-2),
        area: "東側一區",
        quality: "A級",
        quantity: 64,
        unit: "公斤",
        wasteQuantity: 5,
        note: "",
        revision: "1",
        status: "有效",
      },
      {
        id: "demo-production-3",
        date: offsetDate(-4),
        area: "溫室",
        quality: "特級",
        quantity: 12,
        unit: "箱",
        wasteQuantity: 1,
        note: "",
        revision: "1",
        status: "有效",
      },
      {
        id: "demo-production-4",
        date: offsetDate(-6),
        area: "西側二區",
        quality: "一般",
        quantity: 38,
        unit: "台斤",
        wasteQuantity: 2,
        note: "雨後採收",
        revision: "1",
        status: "有效",
      },
    ],
    shipments: [
      {
        id: "demo-shipment-1",
        date: offsetDate(-1),
        shipmentNo: `SH-${offsetDate(-1).replaceAll("-", "")}-01`,
        intermediaryId: firstId,
        intermediaryName: "青田行",
        quality: "特級",
        quantity: 54,
        unit: "公斤",
        unitPrice: 82,
        totalAmount: 4428,
        freight: 0,
        otherFee: 0,
        receivableAmount: 4428,
        paidAmount: 4428,
        paymentStatus: "已收款",
        note: "固定週五出貨",
        revision: "1",
        status: "有效",
      },
      {
        id: "demo-shipment-2",
        date: offsetDate(-3),
        shipmentNo: `SH-${offsetDate(-3).replaceAll("-", "")}-01`,
        intermediaryId: secondId,
        intermediaryName: "南風農產",
        quality: "A級",
        quantity: 22,
        unit: "台斤",
        unitPrice: 48,
        totalAmount: 1056,
        freight: 80,
        otherFee: 0,
        receivableAmount: 1136,
        paidAmount: 0,
        paymentStatus: "未收款",
        note: "",
        revision: "1",
        status: "有效",
      },
      {
        id: "demo-shipment-3",
        date: offsetDate(-5),
        shipmentNo: `SH-${offsetDate(-5).replaceAll("-", "")}-01`,
        intermediaryId: firstId,
        intermediaryName: "青田行",
        quality: "特級",
        quantity: 4,
        unit: "箱",
        unitPrice: 980,
        totalAmount: 3920,
        freight: 0,
        otherFee: 120,
        receivableAmount: 4040,
        paidAmount: 2000,
        paymentStatus: "部分收款",
        note: "",
        revision: "1",
        status: "有效",
      },
    ],
    settings: {
      units: DEFAULT_UNITS.join(","),
      qualities: DEFAULT_QUALITIES.join(","),
      timezone: "Asia/Taipei",
    },
  };
}

function cloneData(data: AppData): AppData {
  return JSON.parse(JSON.stringify(data)) as AppData;
}

function readDemoData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {
    // Browser storage can be blocked in private iframe contexts.
  }
  const initial = seedData();
  writeDemoData(initial);
  return initial;
}

function writeDemoData(data: AppData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // Keep the in-memory result usable when storage is unavailable.
  }
}

export function getEndpoint() {
  try {
    return localStorage.getItem(ENDPOINT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setEndpoint(endpoint: string) {
  const normalized = endpoint.trim().replace(/\/$/, "");
  if (
    normalized &&
    (!normalized.startsWith("https://script.google.com/macros/s/") ||
      !normalized.endsWith("/exec"))
  ) {
    throw new Error(
      "請貼上以 /exec 結尾的正式 Apps Script 網址，不要使用 /dev。"
    );
  }
  try {
    if (normalized) localStorage.setItem(ENDPOINT_KEY, normalized);
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    // The caller can still use the current in-memory session.
  }
}

function endpointUrl(action: string, params: Record<string, string> = {}) {
  const endpoint = getEndpoint();
  if (!endpoint) throw new Error("尚未設定 Google Apps Script 連線網址。");
  const url = new URL(endpoint);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return url.toString();
}

type JsonpResponse<T> = T & { ok?: boolean; error?: string };

function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `laoyeJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";
    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error("Google Sheets 連線逾時，請檢查 Apps Script 部署網址。")
      );
    }, 12000);

    const cleanup = () => {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };

    (window as unknown as Record<string, unknown>)[callbackName] = (
      payload: T
    ) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(
        new Error("無法讀取 Google Sheets，請確認網頁應用程式權限為任何人。")
      );
    };
    script.src = `${url}${separator}callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

export async function loadData(): Promise<{
  data: AppData;
  connected: boolean;
}> {
  const endpoint = getEndpoint();
  if (!endpoint) return { data: readDemoData(), connected: false };

  const response = await jsonp<JsonpResponse<AppData>>(
    endpointUrl("bootstrap")
  );
  if (!response.ok)
    throw new Error(response.error || "Google Sheets 回傳資料格式錯誤。");
  return {
    data: {
      productions: response.productions ?? [],
      shipments: response.shipments ?? [],
      intermediaries: response.intermediaries ?? [],
      settings: response.settings ?? {},
    },
    connected: true,
  };
}

function currentRevision(revision?: string) {
  const number = Number(revision ?? 0);
  return Number.isFinite(number) ? String(number + 1) : `${Date.now()}`;
}

function localMutation(data: AppData, input: MutationInput): AppData {
  const next = cloneData(data);
  const record = input.record ?? {};
  if (input.entity === "production") {
    const records = next.productions;
    if (input.action === "add") {
      records.unshift({
        id: makeId(),
        date: String(record.date ?? todayISO()),
        area: String(record.area ?? ""),
        quality: String(record.quality ?? "一般"),
        quantity: Number(record.quantity ?? 0),
        unit: String(record.unit ?? DEFAULT_UNITS[0]),
        wasteQuantity: Number(record.wasteQuantity ?? 0),
        note: String(record.note ?? ""),
        revision: "1",
        status: "有效",
      });
    } else {
      const index = records.findIndex(item => item.id === input.id);
      if (index >= 0) {
        if (input.action === "delete")
          records[index] = {
            ...records[index],
            status: "作廢",
            revision: currentRevision(records[index].revision),
          };
        else
          records[index] = {
            ...records[index],
            ...(record as Partial<ProductionRecord>),
            revision: currentRevision(records[index].revision),
          };
      }
    }
  }
  if (input.entity === "shipment") {
    const records = next.shipments;
    if (input.action === "add") {
      const quantity = Number(record.quantity ?? 0);
      const unitPrice = Number(record.unitPrice ?? 0);
      const intermediaryName = String(record.intermediaryName ?? "");
      const date = String(record.date ?? todayISO());
      const sameDay = records.filter(item => item.date === date).length + 1;
      const totalAmount = quantity * unitPrice;
      records.unshift({
        id: makeId(),
        date,
        shipmentNo: `SH-${date.replaceAll("-", "")}-${String(sameDay).padStart(2, "0")}`,
        intermediaryId: String(record.intermediaryId ?? ""),
        intermediaryName,
        quality: String(record.quality ?? "一般"),
        quantity,
        unit: String(record.unit ?? DEFAULT_UNITS[0]),
        unitPrice,
        totalAmount,
        freight: Number(record.freight ?? 0),
        otherFee: Number(record.otherFee ?? 0),
        receivableAmount:
          totalAmount +
          Number(record.freight ?? 0) +
          Number(record.otherFee ?? 0),
        paidAmount: Number(record.paidAmount ?? 0),
        paymentStatus: String(record.paymentStatus ?? "未收款"),
        note: String(record.note ?? ""),
        revision: "1",
        status: "有效",
      });
    } else {
      const index = records.findIndex(item => item.id === input.id);
      if (index >= 0) {
        if (input.action === "delete")
          records[index] = {
            ...records[index],
            status: "作廢",
            revision: currentRevision(records[index].revision),
          };
        else {
          const updated = {
            ...records[index],
            ...(record as Partial<ShipmentRecord>),
          };
          updated.totalAmount = updated.quantity * updated.unitPrice;
          updated.receivableAmount =
            updated.totalAmount + updated.freight + updated.otherFee;
          records[index] = {
            ...updated,
            revision: currentRevision(records[index].revision),
          };
        }
      }
    }
  }
  if (input.entity === "intermediary") {
    const records = next.intermediaries;
    if (input.action === "add") {
      records.unshift({
        id: makeId(),
        name: String(record.name ?? ""),
        contactPerson: String(record.contactPerson ?? ""),
        phone: String(record.phone ?? ""),
        defaultUnit: String(record.defaultUnit ?? DEFAULT_UNITS[0]),
        defaultPrice: Number(record.defaultPrice ?? 0),
        note: String(record.note ?? ""),
        status: "啟用",
        revision: "1",
      });
    } else {
      const index = records.findIndex(item => item.id === input.id);
      if (index >= 0) {
        if (input.action === "delete")
          records[index] = {
            ...records[index],
            status: "停用",
            revision: currentRevision(records[index].revision),
          };
        else
          records[index] = {
            ...records[index],
            ...(record as Partial<Intermediary>),
            revision: currentRevision(records[index].revision),
          };
      }
    }
  }
  writeDemoData(next);
  return next;
}

async function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function waitForMutation(requestId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await jsonp<
        JsonpResponse<{
          status?: string;
          result?: { ok?: boolean; error?: string };
        }>
      >(endpointUrl("status", { requestId }));
      if (response.status === "done") {
        if (response.result?.ok === false)
          throw new Error(response.result.error || "Google Sheets 寫入失敗。");
        return;
      }
    } catch (error) {
      if (attempt === 11) throw error;
    }
    await wait(700);
  }
  throw new Error("寫入仍在等待確認，請重新整理後核對資料，勿重複送出。");
}

export async function mutate(
  input: MutationInput
): Promise<{ data?: AppData; connected: boolean }> {
  const endpoint = getEndpoint();
  if (!endpoint)
    return { data: localMutation(readDemoData(), input), connected: false };

  const requestId = makeId();
  const payload = JSON.stringify({ ...input, requestId });
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
    });
  } catch {
    // An opaque/no-cors request can fail to expose a response. Status polling decides the outcome.
  }
  await waitForMutation(requestId);
  const refreshed = await loadData();
  return { data: refreshed.data, connected: true };
}

export function activeProductions(data: AppData) {
  return data.productions.filter(item => item.status !== "作廢");
}

export function activeShipments(data: AppData) {
  return data.shipments.filter(item => item.status !== "作廢");
}

export function activeIntermediaries(data: AppData) {
  return data.intermediaries.filter(item => item.status !== "停用");
}

export function groupQuantity(
  records: Array<{ quantity: number; unit: string }>
) {
  return records.reduce<Record<string, number>>((result, item) => {
    result[item.unit] = (result[item.unit] ?? 0) + Number(item.quantity || 0);
    return result;
  }, {});
}

export function amount(records: Array<{ totalAmount: number }>) {
  return records.reduce(
    (total, item) => total + Number(item.totalAmount || 0),
    0
  );
}

export function quantitySummary(values: Record<string, number>) {
  return (
    Object.entries(values)
      .map(
        ([unit, value]) =>
          `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value)} ${unit}`
      )
      .join(" · ") || "—"
  );
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const protectedValue = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>
) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map(row => headers.map(header => row[header]))]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
