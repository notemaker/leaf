/**
 * 荖葉管理系統：Google Apps Script Web App 後端
 *
 * 使用方式：將本檔貼到 Apps Script 的 Code.gs，先填入自己的試算表 ID，
 * 執行 setup() 後再部署成 Web App。不要把試算表 ID 或 /exec 網址提交到公開程式碼。
 */

var CONFIG = {
  SPREADSHEET_ID: "請填入你的Google試算表ID",
  TIMEZONE: "Asia/Taipei",
  REQUEST_PREFIX: "laoye-request-",
};

var SHEETS = {
  production: {
    name: "出產紀錄",
    headers: [
      "ID",
      "日期",
      "區域",
      "品質等級",
      "數量",
      "單位",
      "報廢數量",
      "備註",
      "revision",
      "狀態",
      "建立時間",
    ],
  },
  shipment: {
    name: "出貨紀錄",
    headers: [
      "ID",
      "出貨日期",
      "出貨單號",
      "中間商ID",
      "中間商",
      "品質等級",
      "數量",
      "單位",
      "單價",
      "出貨金額",
      "運費",
      "其他費用",
      "應收金額",
      "已收款",
      "收款狀態",
      "備註",
      "revision",
      "狀態",
      "建立時間",
    ],
  },
  intermediary: {
    name: "中間商",
    headers: [
      "ID",
      "名稱",
      "聯絡人",
      "電話",
      "慣用單位",
      "預設單價",
      "備註",
      "狀態",
      "revision",
      "建立時間",
    ],
  },
  settings: {
    name: "設定",
    headers: ["鍵", "值", "說明"],
  },
};

function setup() {
  var spreadsheet = getSpreadsheet_();
  Object.keys(SHEETS).forEach(function (key) {
    var definition = SHEETS[key];
    var sheet = spreadsheet.getSheetByName(definition.name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(definition.name);
      sheet
        .getRange(1, 1, 1, definition.headers.length)
        .setValues([definition.headers]);
      sheet.setFrozenRows(1);
    } else {
      var lastColumn = Math.max(
        sheet.getLastColumn(),
        definition.headers.length
      );
      var existing = sheet
        .getRange(1, 1, 1, lastColumn)
        .getDisplayValues()[0]
        .slice(0, definition.headers.length);
      var hasData = sheet.getLastRow() > 1;
      var matches = definition.headers.every(function (header, index) {
        return existing[index] === header;
      });
      if (!matches && hasData) {
        throw new Error(
          "工作表「" +
            definition.name +
            "」已有資料但標題不符合，為避免覆蓋資料，setup() 已停止。請先備份並整理標題。"
        );
      }
      if (!matches)
        sheet
          .getRange(1, 1, 1, definition.headers.length)
          .setValues([definition.headers]);
      sheet.setFrozenRows(1);
    }
  });

  var settings = spreadsheet.getSheetByName(SHEETS.settings.name);
  if (settings.getLastRow() === 1) {
    settings.getRange(2, 1, 3, 3).setValues([
      [
        "units",
        "公斤,台斤,箱,把",
        "可使用的數量單位；不同單位統計時不直接相加",
      ],
      ["qualities", "特級,A級,B級,一般", "可使用的品質等級"],
      ["timezone", CONFIG.TIMEZONE, "系統時區"],
    ]);
  }
  return { ok: true, message: "初始化完成，已建立荖葉管理系統工作表。" };
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || "bootstrap";
  var callback = params.callback || "";
  var result;
  try {
    if (action === "health")
      result = { ok: true, service: "laoye-google-sheets" };
    else if (action === "bootstrap") result = bootstrap_();
    else if (action === "status") result = status_(params.requestId);
    else result = { ok: false, error: "不支援的讀取動作。" };
  } catch (error) {
    result = { ok: false, error: error.message || String(error) };
  }
  return output_(result, callback);
}

function doPost(e) {
  var body = e && e.postData && e.postData.contents ? e.postData.contents : "";
  var result;
  try {
    var payload = JSON.parse(body);
    result = mutate_(payload);
  } catch (error) {
    result = { ok: false, error: error.message || String(error) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function bootstrap_() {
  getSpreadsheet_();
  return {
    ok: true,
    productions: readRecords_("production"),
    shipments: readRecords_("shipment"),
    intermediaries: readRecords_("intermediary"),
    settings: readSettings_(),
    updatedAt: new Date().toISOString(),
  };
}

function status_(requestId) {
  if (!requestId || !/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) {
    return { ok: false, error: "requestId 格式錯誤。" };
  }
  var raw = PropertiesService.getScriptProperties().getProperty(
    CONFIG.REQUEST_PREFIX + requestId
  );
  if (!raw) return { ok: true, status: "pending", requestId: requestId };
  var saved = JSON.parse(raw);
  return {
    ok: true,
    status: saved.status || "pending",
    requestId: requestId,
    result: saved.result || null,
  };
}

function mutate_(payload) {
  if (
    !payload ||
    !payload.requestId ||
    !/^[A-Za-z0-9_-]{8,120}$/.test(payload.requestId)
  ) {
    throw new Error("requestId 必須是 8 至 120 個英數字、底線或連字號。 ");
  }
  var key = CONFIG.REQUEST_PREFIX + payload.requestId;
  var properties = PropertiesService.getScriptProperties();
  var existing = properties.getProperty(key);
  if (existing) return JSON.parse(existing);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    existing = properties.getProperty(key);
    if (existing) return JSON.parse(existing);
    properties.setProperty(key, JSON.stringify({ status: "pending" }));
    var result = applyMutation_(payload);
    var done = { ok: true, status: "done", result: result };
    properties.setProperty(key, JSON.stringify(done));
    return done;
  } catch (error) {
    var failed = {
      ok: true,
      status: "done",
      result: { ok: false, error: error.message || String(error) },
    };
    properties.setProperty(key, JSON.stringify(failed));
    return failed;
  } finally {
    lock.releaseLock();
  }
}

function applyMutation_(payload) {
  var entity = payload.entity;
  var action = payload.action;
  if (!SHEETS[entity] || ["add", "edit", "delete"].indexOf(action) === -1)
    throw new Error("資料異動參數錯誤。");
  if (action === "add") return addRecord_(entity, payload.record || {});
  if (!payload.id || !payload.revision)
    throw new Error("編輯或作廢需要穩定 ID 與最新 revision。");
  return action === "edit"
    ? editRecord_(
        entity,
        payload.id,
        String(payload.revision),
        payload.record || {}
      )
    : deleteRecord_(entity, payload.id, String(payload.revision));
}

function addRecord_(entity, input) {
  var definition = SHEETS[entity];
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  var record = buildRecord_(entity, input, null);
  sheet.appendRow(record.row);
  return { ok: true, id: record.id, revision: record.revision };
}

function editRecord_(entity, id, revision, input) {
  var found = findRecord_(entity, id);
  if (!found) throw new Error("找不到要編輯的資料。");
  if (String(found.object.revision) !== revision)
    throw new Error("資料已被更新，請重新整理後再編輯。");
  var definition = SHEETS[entity];
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  var merged = mergeObjects_(found.object, input);
  var record = buildRecord_(entity, merged, found.object);
  sheet
    .getRange(found.rowNumber, 1, 1, definition.headers.length)
    .setValues([record.row]);
  return { ok: true, id: id, revision: record.revision };
}

function deleteRecord_(entity, id, revision) {
  var found = findRecord_(entity, id);
  if (!found) throw new Error("找不到要作廢的資料。");
  if (String(found.object.revision) !== revision)
    throw new Error("資料已被更新，請重新整理後再作廢。");
  var definition = SHEETS[entity];
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  var values = found.row.slice();
  var statusIndex = definition.headers.indexOf("狀態");
  var revisionIndex = definition.headers.indexOf("revision");
  if (statusIndex >= 0) values[statusIndex] = "作廢";
  if (revisionIndex >= 0)
    values[revisionIndex] = nextRevision_(found.object.revision);
  sheet
    .getRange(found.rowNumber, 1, 1, definition.headers.length)
    .setValues([values]);
  return { ok: true, id: id, revision: values[revisionIndex] };
}

function readRecords_(entity) {
  var definition = SHEETS[entity];
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, definition.headers.length)
    .getDisplayValues();
  return rows
    .filter(function (row) {
      return row[0];
    })
    .map(function (row) {
      return rowToObject_(entity, row);
    });
}

function readSettings_() {
  var definition = SHEETS.settings;
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  return rows.reduce(function (result, row) {
    if (row[0]) result[row[0]] = row[1];
    return result;
  }, {});
}

function findRecord_(entity, id) {
  var definition = SHEETS[entity];
  var sheet = getSpreadsheet_().getSheetByName(definition.name);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, definition.headers.length)
    .getDisplayValues();
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0]) === String(id)) {
      return {
        rowNumber: index + 2,
        row: rows[index],
        object: rowToObject_(entity, rows[index]),
      };
    }
  }
  return null;
}

function rowToObject_(entity, row) {
  if (entity === "production") {
    return {
      id: row[0],
      date: row[1],
      area: row[2],
      quality: row[3],
      quantity: number_(row[4]),
      unit: row[5],
      wasteQuantity: number_(row[6]),
      note: row[7],
      revision: row[8] || "1",
      status: row[9] || "有效",
      createdAt: row[10],
    };
  }
  if (entity === "shipment") {
    return {
      id: row[0],
      date: row[1],
      shipmentNo: row[2],
      intermediaryId: row[3],
      intermediaryName: row[4],
      quality: row[5],
      quantity: number_(row[6]),
      unit: row[7],
      unitPrice: number_(row[8]),
      totalAmount: number_(row[9]),
      freight: number_(row[10]),
      otherFee: number_(row[11]),
      receivableAmount: number_(row[12]),
      paidAmount: number_(row[13]),
      paymentStatus: row[14],
      note: row[15],
      revision: row[16] || "1",
      status: row[17] || "有效",
      createdAt: row[18],
    };
  }
  return {
    id: row[0],
    name: row[1],
    contactPerson: row[2],
    phone: row[3],
    defaultUnit: row[4],
    defaultPrice: number_(row[5]),
    note: row[6],
    status: row[7] || "啟用",
    revision: row[8] || "1",
    createdAt: row[9],
  };
}

function buildRecord_(entity, input, previous) {
  var id = previous ? previous.id : String(input.id || Utilities.getUuid());
  var revision = previous ? nextRevision_(previous.revision) : "1";
  var createdAt = previous ? previous.createdAt : new Date().toISOString();
  var row;
  if (entity === "production") {
    var production = {
      id: id,
      date: date_(input.date),
      area: text_(input.area),
      quality: text_(input.quality || "一般"),
      quantity: positive_(input.quantity),
      unit: text_(input.unit || "公斤"),
      wasteQuantity: nonNegative_(input.wasteQuantity),
      note: text_(input.note),
      revision: revision,
      status: previous ? previous.status : "有效",
      createdAt: createdAt,
    };
    row = [
      production.id,
      production.date,
      production.area,
      production.quality,
      production.quantity,
      production.unit,
      production.wasteQuantity,
      production.note,
      production.revision,
      production.status,
      production.createdAt,
    ];
  } else if (entity === "shipment") {
    var quantity = positive_(input.quantity);
    var unitPrice = nonNegative_(input.unitPrice);
    var freight = nonNegative_(input.freight);
    var otherFee = nonNegative_(input.otherFee);
    var total = quantity * unitPrice;
    var shipment = {
      id: id,
      date: date_(input.date),
      shipmentNo: text_(
        input.shipmentNo ||
          "SH-" +
            String(input.date || "").replace(/-/g, "") +
            "-" +
            Utilities.getUuid().slice(0, 4)
      ),
      intermediaryId: text_(input.intermediaryId),
      intermediaryName: text_(input.intermediaryName),
      quality: text_(input.quality || "一般"),
      quantity: quantity,
      unit: text_(input.unit || "公斤"),
      unitPrice: unitPrice,
      totalAmount: total,
      freight: freight,
      otherFee: otherFee,
      receivableAmount: total + freight + otherFee,
      paidAmount: nonNegative_(input.paidAmount),
      paymentStatus: text_(input.paymentStatus || "未收款"),
      note: text_(input.note),
      revision: revision,
      status: previous ? previous.status : "有效",
      createdAt: createdAt,
    };
    row = [
      shipment.id,
      shipment.date,
      shipment.shipmentNo,
      shipment.intermediaryId,
      shipment.intermediaryName,
      shipment.quality,
      shipment.quantity,
      shipment.unit,
      shipment.unitPrice,
      shipment.totalAmount,
      shipment.freight,
      shipment.otherFee,
      shipment.receivableAmount,
      shipment.paidAmount,
      shipment.paymentStatus,
      shipment.note,
      shipment.revision,
      shipment.status,
      shipment.createdAt,
    ];
  } else {
    var intermediary = {
      id: id,
      name: text_(input.name),
      contactPerson: text_(input.contactPerson),
      phone: text_(input.phone),
      defaultUnit: text_(input.defaultUnit || "公斤"),
      defaultPrice: nonNegative_(input.defaultPrice),
      note: text_(input.note),
      status: previous ? previous.status : "啟用",
      revision: revision,
      createdAt: createdAt,
    };
    row = [
      intermediary.id,
      intermediary.name,
      intermediary.contactPerson,
      intermediary.phone,
      intermediary.defaultUnit,
      intermediary.defaultPrice,
      intermediary.note,
      intermediary.status,
      intermediary.revision,
      intermediary.createdAt,
    ];
  }
  return { id: id, revision: revision, row: row };
}

function mergeObjects_(oldObject, input) {
  var merged = {};
  Object.keys(oldObject).forEach(function (key) {
    merged[key] = oldObject[key];
  });
  Object.keys(input || {}).forEach(function (key) {
    merged[key] = input[key];
  });
  return merged;
}

function getSpreadsheet_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf("請填入") === 0)
    throw new Error("請先在 CONFIG.SPREADSHEET_ID 填入 Google 試算表 ID。");
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function output_(value, callback) {
  var json = JSON.stringify(value);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(
      callback + "(" + json + ");"
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(
    ContentService.MimeType.JSON
  );
}

function text_(value) {
  var text = String(value == null ? "" : value).trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function number_(value) {
  var parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
  return isFinite(parsed) ? parsed : 0;
}

function nonNegative_(value) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0)
    throw new Error("數值必須是大於或等於 0 的數字。");
  return Math.round(parsed * 100) / 100;
}

function positive_(value) {
  var parsed = nonNegative_(value);
  if (parsed <= 0) throw new Error("數量必須大於 0。");
  return parsed;
}

function date_(value) {
  var date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("日期必須使用 YYYY-MM-DD 格式。");
  return date;
}

function nextRevision_(revision) {
  var number = Number(revision || 0);
  return String(isFinite(number) ? number + 1 : 1);
}
