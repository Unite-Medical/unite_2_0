import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "../components/layout/AdminShell.jsx";
import { WorkspaceIcon } from "../components/workspace/WorkspaceIcon.jsx";
import { warehouseFormState } from "../lib/warehouseForm.js";
import "./WarehouseMobile.css";
import { WarehouseMap3D } from "../components/warehouse/WarehouseMap3D.jsx";
import { BarcodeScanner } from "../components/warehouse/BarcodeScanner.jsx";
import { WarehouseBrowser } from "../components/warehouse/WarehouseBrowser.jsx";
import { countFormForRow, manualArea, resolveLocation } from "../lib/warehouseBrowse.js";
import { mapLocations } from "../lib/warehouseSpatial.js";
const initial = {
  raw_barcode: "",
  inventory_id: "",
  sku: "",
  warehouse_id: "",
  bin_id: "",
  lot_id: "",
  lot_number: "",
  expiration_date: "",
  serial_number: "",
  udi: "",
  cases: "0",
  eaches: "",
  units_per_case: "",
  pack_confirmed: false,
  confirmed: false,
  whole_sku_confirmed: false,
  reason: "",
  not_applicable_reason: "",
  po_id: "",
  order_id: "",
  order_item_id: "",
  container_id: "",
  task_id: "",
  capture_method: "manual",
};
async function request(body) {
  const r = await fetch("/api/wms/mobile", {
    method: body ? "POST" : "GET",
    credentials: "include",
    signal: AbortSignal.timeout(25000),
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Refresh or retry the exact submission.",
    );
  }
  if (!r.ok || data.ok === false) {
    const error = new Error(
      String(data.error || data.reason || "Request failed").replaceAll(
        "_",
        " ",
      ),
    );
    error.definitive = r.status < 500;
    throw error;
  }
  return data;
}
const label = (r) => r?.code || r?.name || r?.id || "";
const native = () => Boolean(window.webkit?.messageHandlers?.warehouse);
export function WarehouseMobile() {
  const [data, setData] = useState(null),
    [tab, setTab] = useState("inventory"),
    [mode, setMode] = useState("count"),
    [form, setForm] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [refreshing, setRefreshing] = useState(true),
    [dirtyTabs, setDirtyTabs] = useState({}),
    [discardOpen, setDiscardOpen] = useState(false),
    [suggestion, setSuggestion] = useState(null),
    [scanArea, setScanArea] = useState(null),
    [mapId, setMapId] = useState(""),
    [point, setPoint] = useState(null),
    [selectedBin, setSelectedBin] = useState(""),
    [placing, setPlacing] = useState(false),
    [code, setCode] = useState(""),
    [task, setTask] = useState({
      assigned_to: "",
      sku: "",
      warehouse_id: "",
      reason: "",
      urgent: false,
    }),
    [box, setBox] = useState({
      container_id: "",
      lot_id: "",
      bin_id: "",
      kind: "case",
      state: "sealed",
      units_remaining: "",
      units_per_case: "",
      confirmed: false,
    });
  const [openingLines, setOpeningLines] = useState([]), [openingConfirmed, setOpeningConfirmed] = useState(false);
  const openingRef = useRef(openingLines);
  useEffect(() => { openingRef.current = openingLines; }, [openingLines]);
  const [cameraTarget, setCameraTarget] = useState(null),
    [manualLayout, setManualLayout] = useState({ name: '', warehouse_id: '', width: '12', depth: '18' });
  const closeCamera = useCallback(() => setCameraTarget(null), []);
  const barcodeInput = useRef(null);
  const currentDraft = useRef(form);
  useEffect(() => { currentDraft.current = form; }, [form]);
  const restored = useRef('');
  const [draftReady, setDraftReady] = useState(false);
  const dirty = Object.values(dirtyTabs).some(Boolean);
  const pending = useRef(null),
    mounted = useRef(true),
    refreshingRef = useRef(false),
    writingRef = useRef(false);
  const [hasPending, setHasPending] = useState(false),
    [baseline, setBaseline] = useState(null);
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const d = await request();
      if (mounted.current) {
        setData(d);
        setConnectionError("");
      }
    } catch (e) {
      if (mounted.current) setConnectionError(e.message);
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(refresh);
    const t = setInterval(refresh, 60000);
    const offline = () => setConnectionError("This device is offline.");
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      mounted.current = false;
      clearInterval(t);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data?.actor.id || restored.current === data.actor.id) return;
    restored.current = data.actor.id;
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem('unite-warehouse-draft:' + data.actor.id) || 'null');
        if (saved?.form && saved.version === 1) {
          setForm({...initial,...saved.form,confirmed:false});
          setBaseline(saved.baseline || null); setMode(saved.mode || 'count');
          setOpeningLines(saved.openingLines || []); setOpeningConfirmed(false);
          setScanArea(saved.scanArea || null); setPoint(saved.point || null); setCode(saved.code || '');
          if(saved.manualLayout) setManualLayout(saved.manualLayout);
          setBox(saved.box); setDirtyTabs(saved.dirtyTabs || {}); setTask(saved.task);
          if (saved.pending) { pending.current = saved.pending; setHasPending(true); setError('A submission was interrupted. Retry the exact submission to verify whether it was saved.'); }
          setTab(saved.tab || 'scan'); setNotice('Restored this tab’s unsaved warehouse work. Recheck the physical details before submitting.');
        }
      } catch { /* Storage can be disabled in private browsing. */ }
      setDraftReady(true);
    });
  }, [data?.actor.id]);
  useEffect(() => {
    if (!draftReady || !data?.actor.id) return;
    try {
      const key = 'unite-warehouse-draft:' + data.actor.id;
      if (dirty || hasPending) sessionStorage.setItem(key,JSON.stringify({version:1,form,baseline,mode,box,task,tab,dirtyTabs,openingLines,scanArea,point,code,manualLayout,pending:pending.current}));
      else sessionStorage.removeItem(key);
    } catch { /* Navigation protection still works when storage is unavailable. */ }
  }, [draftReady,data?.actor.id,dirty,hasPending,form,baseline,mode,box,task,tab,dirtyTabs,openingLines,scanArea,point,code,manualLayout]);
  const set = (key, value) =>
    setForm((f) => ({ ...f, [key]: value, confirmed: false }));
  const lookup = useCallback(async (raw) => {
    if (!raw.trim() || writingRef.current || pending.current) return;
    if (openingRef.current.length) { setError('Finish or clear the opening worksheet before scanning another product.'); return; }
    if (currentDraft.current.eaches !== '' || Number(currentDraft.current.cases) > 0) { setError('Save or clear the physical count before scanning a different label.'); return; }
    writingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await request({ action: "resolve", raw });
      if (!d.product) throw new Error('No matching product. Check the label or choose a catalog item.');
      setDirtyTabs((t) => ({ ...t, scan: true }));
      setForm((f) => ({
        ...initial,
        warehouse_id: d.container?.warehouse_id || f.warehouse_id,
        bin_id: d.container?.bin_id || f.bin_id,
        lot_id: d.container?.lot_id || "",
        container_id: d.container?.id || "",
        raw_barcode: raw,
        sku: d.product.sku,
        lot_number: d.parsed.lot || "",
        expiration_date: d.parsed.expiration || "",
        serial_number: d.parsed.serial || "",
        udi: d.parsed.gtin ? raw : "",
        units_per_case: d.product.pack_verified
          ? String(d.product.units_per_case || "")
          : "",
        capture_method: "barcode",
        reason: f.reason,
        task_id: f.task_id,
      }));
      setNotice(
        "Matched " + d.product.name + ". Confirm quantity and traceability.",
      );
    } catch (e) {
      setError(e.message);
      // Preserve physical evidence if a new label fails to resolve.

    } finally {
      writingRef.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const receive = (e) => {
      if (e.detail.type === "refresh") {
        if (dirty || pending.current)
          setError(
            "Save or clear your draft before refreshing from the app toolbar.",
          );
        else refresh();
      }
      if (e.detail.type === "barcode") { setTab("scan"); lookup(e.detail.value); }
      if (e.detail.type === "location") {
        const found = resolveLocation(e.detail.value, data?.bins || [], currentDraft.current.warehouse_id);
        if (found.bin) { setForm(f=>({...f,warehouse_id:found.bin.warehouse_id,bin_id:found.bin.id,confirmed:false}));setDirtyTabs(t=>({...t,scan:true})); }
        else setError(found.error);
      }
      if (e.detail.type === "area") {
        setScanArea(e.detail.value);
        setDirtyTabs((t) => ({ ...t, map: true }));
        setTab("map");
      }
    };
    window.addEventListener("unite-native", receive);
    return () => window.removeEventListener("unite-native", receive);
  }, [data, lookup, dirty, refresh]);
  const submit = async (payload) => {
    if (writingRef.current || connectionError) return;
    writingRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const signature = JSON.stringify(payload);
      if (pending.current && pending.current.signature !== signature)
        throw new Error(
          "A previous submission is unresolved. Retry it before changing the request.",
        );
      const body = pending.current?.body || {
        ...payload,
        idempotency_key: crypto.randomUUID(),
      };
      pending.current = { body, signature };
      setHasPending(true);
      const d = await request(body);
      pending.current = null;
      setHasPending(false);
      setNotice(d.result?.message || "Saved on the server.");
      const section = ["count", "opening_count", "receive", "pick"].includes(payload.action)
        ? "scan"
        : payload.action === "container"
          ? "cases"
          : ["task", "approve_count", "reject_count"].includes(payload.action)
            ? "tasks"
            : "map";
      setDirtyTabs((t) => ({ ...t, [section]: false }));
      setBox((b) => ({ ...b, confirmed: false }));
      setForm((f) => ({ ...f, confirmed: false }));
      await refresh();
      return d;
    } catch (e) {
      if (e.definitive) {
        pending.current = null;
        setHasPending(false);
      }
      setError(e.message);
    } finally {
      writingRef.current = false;
      setBusy(false);
    }
  };
  const retry = async () => {
    if (pending.current) {
      const { idempotency_key: _, ...body } = pending.current.body;
      await submit(body);
    }
  };
  const inv =
    data?.inventory.find((i) => i.id === form.inventory_id) ||
    data?.inventory.find(
      (i) => i.sku === form.sku && i.warehouse_id === form.warehouse_id,
    );
  useEffect(() => {
    queueMicrotask(() =>
      setBaseline((before) =>
        before?.id === inv?.id
          ? before
          : inv
            ? { id: inv.id, snapshot: inv.snapshot }
            : null,
      ),
    );
  }, [inv]); // Capture the count baseline when choosing a stock pool.
  const product = data?.products.find((p) => p.sku === form.sku);
  const bins =
    data?.bins.filter((b) => b.warehouse_id === form.warehouse_id) || [];
  const lots =
    data?.lots.filter(
      (l) =>
        l.product_sku === form.sku &&
        l.warehouse_id === form.warehouse_id &&
        (l.owner_type || "unite") === (inv?.owner_type || "unite") &&
        (l.owner_org_id || "") === (inv?.owner_org_id || ""),
    ) || [];
  const managers = ["admin", "warehouse_manager"].includes(data?.actor.role);
  const whole = (value) => /^\d+$/.test(String(value));
  const { total, quantityReady, ready, issues } = warehouseFormState({
    form,
    product,
    mode,
    inventory: inv,
    baseline,
    lots,
    containers: data?.containers,
  });
  const activeTasks = data?.tasks.filter((t) => t.status === "open") || [];
  const scan = (target) => {
    if (target === 'product' && (openingLines.length > 0 || form.eaches !== '' || Number(form.cases) > 0)) { setError('Save or clear your current count before scanning another product.'); return; }
    if (native())
      window.webkit.messageHandlers.warehouse.postMessage({
        action: "barcode",
        target,
      });
    else setCameraTarget(target);
  };
  const handleCameraRead = (raw) => {
    const target = cameraTarget;
    setCameraTarget(null);
    if (target === 'location') {
      const found = resolveLocation(raw, data.bins, form.warehouse_id);
      if (found.error) setError(found.error);
      else { setForm(f=>({...f,warehouse_id:found.bin.warehouse_id,bin_id:found.bin.id,confirmed:false})); setDirtyTabs(t=>({...t,scan:true})); setNotice('Location matched: ' + label(found.bin)); }
    } else lookup(raw);
  };
  const chooseLot = (id) => {
    const lot = data.lots.find((l) => l.id === id);
    setForm((f) => ({
      ...f,
      lot_id: id,
      container_id: "",
      lot_scope_confirmed: false,
      serial_number: lot?.serial_number || "",
      udi: lot?.udi || "",
      not_applicable_reason: lot?.not_applicable_reason || "",
      lot_number: lot?.lot_number || "",
      expiration_date:
        lot?.expiration_date || (lot?.expiration_not_applicable ? "N/A" : ""),
      bin_id: lot?.bin_id || f.bin_id,
      confirmed: false,
    }));
  };
  const readPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setSuggestion(null);
    try {
      if (file.size > 1900000)
        throw new Error("Choose a JPG or PNG smaller than 1.9 MB.");
      const image = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const d = await request({ action: "assist", image });
      setSuggestion(d.suggestion);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const map = data?.maps.find((m) => m.id === mapId) || data?.maps[0];
  const locations = useMemo(() => map && data ? mapLocations(map, data) : [], [map, data]);
  const selectedLocation = locations.find((b) => b.id === selectedBin);
  const startArea = () => {
    if (scanArea) { setError("Save or clear the current area scan before starting another."); return; }
    if (native()) window.webkit.messageHandlers.warehouse.postMessage({ action: "area" });
    else setNotice("Open Unite Warehouse in TestFlight on your LiDAR-equipped iPhone Pro or iPad Pro, then tap Scan warehouse.");
  };
  const scanAt = (bin) => {
    if (dirtyTabs.scan || hasPending) { setError("Save or clear your current inventory draft before counting another location."); return; }
    setForm({ ...initial, warehouse_id: bin.warehouse_id, bin_id: bin.id });
    setMode("count"); setTab("scan"); scan("product");
  };
  const startCount = row => {
    if (dirtyTabs.scan || hasPending) { setError('Save or clear the current count before starting another.'); return; }
    setForm(countFormForRow(row, initial));
    setBaseline({id:row.inventory.id,snapshot:row.inventory.snapshot});
    setMode('count'); setTab('scan'); setError(''); setNotice('');
    setDirtyTabs(t=>({...t,scan:true}));
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const editContainer = c => {
    if (dirtyTabs.cases || hasPending) { setError('Save or clear the current container draft first.'); return; }
    setBox({...c,container_id:c.id,units_remaining:String(c.units_remaining),units_per_case:String(c.units_per_case),confirmed:false});
    setTab('cases'); setDirtyTabs(t=>({...t,cases:true}));
  };
  return (
    <AdminShell active="warehouse-mobile" unsavedChanges={dirty || hasPending}>
      <main
        id="main"
        className={`wm wm-tab-${tab}`}
        onChangeCapture={e => { if (!e.target.closest('[data-warehouse-browser]') && !e.target.hasAttribute('data-filter')) setDirtyTabs(t=>({...t,[tab]:true})); }}
      >
        {cameraTarget && <BarcodeScanner target={cameraTarget} onRead={handleCameraRead} onClose={closeCamera}/>}
        <header className="wm-heading">
          <div>
            <p className="wm-eyebrow">WAREHOUSE OPERATIONS</p>
            <h1>Warehouse workspace<span className="wm-title-dot">.</span></h1>
            <p>Find it. Count it. Know exactly what’s on the floor.</p>
          </div>
          <div className="wm-heading-actions">
            {dirty && !hasPending && (
              <button onClick={() => setDiscardOpen(true)} disabled={busy}>
                Clear drafts
              </button>
            )}
            <span
              className={`wm-status ${connectionError ? "is-warning" : ""}`}
            >
              <span />
              {connectionError
                ? "Sync unavailable"
                : data
                  ? "Connected to staging"
                  : "Connecting…"}
            </span>
            <button
              onClick={refresh}
              disabled={refreshing || busy}
              aria-label="Refresh warehouse data"
            >
              <WorkspaceIcon name="refresh" size={16} />
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
          </div>
        </header>
        {discardOpen && (
          <div className="wm-alert" role="alert">
            <strong>Clear all unsaved entries?</strong>
            <p>
              This clears the current count, container, task and map drafts on
              this device. Saved records remain available.
            </p>
            <button
              onClick={() => {
                setForm(initial);
                setBaseline(null);
                setOpeningLines([]); setOpeningConfirmed(false);
                setManualLayout({name:'',warehouse_id:'',width:'12',depth:'18'});
                setBox({
                  container_id: "",
                  lot_id: "",
                  bin_id: "",
                  kind: "case",
                  state: "sealed",
                  units_remaining: "",
                  units_per_case: "",
                  confirmed: false,
                });
                setTask({
                  assigned_to: "",
                  sku: "",
                  warehouse_id: "",
                  reason: "",
                  urgent: false,
                });
                setScanArea(null);
                setPoint(null);
                setCode("");
                setSuggestion(null);
                setDirtyTabs({});
                setDiscardOpen(false);
              }}
            >
              Clear unsaved entries
            </button>
            <button onClick={() => setDiscardOpen(false)}>Keep editing</button>
          </div>
        )}
        <section className="wm-scan-launch">
          <div><p className="wm-eyebrow">ON THE FLOOR</p><h2>Every pallet. Every unit.</h2><p>Scan a product or pallet label, check its location, then record what you physically count.</p><div className="wm-journey"><span><b>1</b> Identify</span><i/><span><b>2</b> Count</span><i/><span><b>3</b> Review</span></div></div>
          <div className="wm-launch-actions"><button className="wm-scan-primary" disabled={!data || busy || hasPending || !!connectionError || !!dirtyTabs.scan} onClick={() => {setTab("scan");scan("product");}}><ScanIcon/>Scan a label</button><button disabled={!data || busy || hasPending} onClick={() => {setTab('scan');queueMicrotask(()=>barcodeInput.current?.focus());}}>Enter a barcode or SKU</button><span>iPad camera · product, pallet or case</span></div>
        </section>
        <nav aria-label="Warehouse screens">
          {[
            ["inventory", "Map & inventory", "grid"],
            ["map", "Area setup / 3D", "grid"],
            ["scan", "Count / receive / pick", "search"],
            ["cases", "Cases & pallets", "box"],
            ["tasks", "Counts & tasks", "list"],
          ].map(([id, name, icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setNotice("");
              }}
            >
              <WorkspaceIcon name={icon} size={17} />
              {name}
              {id === "tasks" && activeTasks.length > 0 && (
                <span className="wm-badge">{activeTasks.length}</span>
              )}
            </button>
          ))}
        </nav>
        {connectionError && (
          <div role="alert" className="wm-alert">
            <strong>Warehouse sync is unavailable.</strong>
            <p>
              {connectionError}{" "}
              {data
                ? "Showing the last successful refresh. Reconnect before submitting changes."
                : "Sign in again if your session has expired."}
            </p>
            <button onClick={refresh} disabled={refreshing}>
              Retry connection
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="wm-alert">
            {error}
            {hasPending && (
              <>
                <button onClick={retry} disabled={busy}>
                  Retry exact submission
                </button>
                <p>Keep this tab open and retry after reconnecting. The same request ID prevents a duplicate write.</p>
              </>
            )}
          </div>
        )}
        {notice && (
          <div role="status" className="wm-notice">
            {notice}
          </div>
        )}
        {!data ? (
          <div className="wm-empty wm-card" role="status" aria-live="polite">
            <WorkspaceIcon name="box" size={28} />
            <h2>
              {refreshing
                ? "Loading your warehouse"
                : "Waiting for a connection"}
            </h2>
            <p>
              Inventory, assigned counts and saved locations will appear here.
            </p>
          </div>
        ) : (
          <>
            {tab === "inventory" && <WarehouseBrowser data={data} disabled={busy || hasPending || !!connectionError} onCount={startCount} onContainer={editContainer} onScan={()=>{setTab('scan');scan('product');}} onLayout={()=>setTab('map')}/>}
            {tab === "scan" && (
              <div className="wm-columns">
                <section className="wm-card">
                  <div className="wm-section-heading">
                    <span className="wm-section-icon">
                      <WorkspaceIcon name="box" size={20} />
                    </span>
                    <div>
                      <h2>Inventory capture</h2>
                      <p>Scan a label, verify the details, then confirm.</p>
                    </div>
                  </div>
                  {form.sku && <div className="wm-active-product"><WorkspaceIcon name="box" size={24}/><div><strong>{product?.name || form.sku}</strong><small>{form.sku}{form.container_id ? ' · ' + form.container_id : ''}</small></div></div>}
                  <div className="wm-segments">
                    {["count", "receive", "pick"].map((m) => (
                      <button
                        key={m}
                        disabled={busy || hasPending || openingLines.length > 0}
                        onClick={() => {
                          setMode(m);
                          set("confirmed", false);
                        }}
                        aria-pressed={mode === m}
                      >
                        {m === "pick"
                          ? "Pick out"
                          : m === "receive"
                            ? "Receive in"
                            : "Count / update"}
                      </button>
                    ))}
                  </div>
                  <fieldset
                    disabled={busy || hasPending || Boolean(connectionError)}
                  >
                    <h3 className="wm-step">
                      <span>01</span> Identify the product
                    </h3>
                    <div className="wm-scanrow">
                      <label>
                        Barcode or exact SKU
                        <input
                          disabled={openingLines.length > 0}
                          ref={barcodeInput}
                          autoComplete="off" autoCapitalize="off" spellCheck={false}
                          placeholder="Scan with camera or enter the label"
                          value={form.raw_barcode}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              raw_barcode: e.target.value,
                              sku: "",
                              lot_id: "",
                              inventory_id: "",
                              confirmed: false,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              lookup(form.raw_barcode);
                            }
                          }}
                        />
                      </label>
                      <button onClick={() => scan("product")}>
                        Scan barcode
                      </button>
                      <button
                        disabled={!form.raw_barcode.trim()}
                        onClick={() => lookup(form.raw_barcode)}
                      >
                        Find item
                      </button>
                    </div>
                    <label>
                      Matched product
                      <select disabled={openingLines.length > 0}
                        value={form.sku}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...initial,
                            warehouse_id: f.warehouse_id,
                            bin_id: f.bin_id,
                            sku: e.target.value,
                            task_id: f.task_id,
                            units_per_case: data.products.find(
                              (p) => p.sku === e.target.value,
                            )?.pack_verified
                              ? String(
                                  data.products.find(
                                    (p) => p.sku === e.target.value,
                                  ).units_per_case || "",
                                )
                              : "",
                          }))
                        }
                      >
                        <option value="">Choose a catalog item</option>
                        {data.products
                          .filter((p) => p.sku)
                          .map((p) => (
                            <option key={p.id} value={p.sku}>
                              {p.sku} · {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <details className="wm-location-details" open={!form.lot_id}><summary><span>02 · Location & lot</span><strong>{label(data.bins.find(b=>b.id===form.bin_id)) || 'Choose location'}{form.lot_number ? ' · ' + form.lot_number : ''}</strong></summary>
                    <h3 className="wm-step">Locate the stock</h3>
                    {data.bins.length === 0 && (
                      <div className="wm-inline-note">
                        <WorkspaceIcon name="grid" size={17} />
                        <p>
                          No locations are registered yet. Add warehouse
                          locations before recording a count.
                        </p>
                        <button onClick={() => setTab("map")}>
                          View locations
                        </button>
                      </div>
                    )}
                    <div className="wm-grid">
                      <label>
                        Warehouse
                        <select disabled={openingLines.length > 0}
                          value={form.warehouse_id}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              warehouse_id: e.target.value,
                              bin_id: "",
                              lot_id: "",
                              inventory_id: "",
                              confirmed: false,
                            }))
                          }
                        >
                          <option value="">Select warehouse</option>
                          {data.warehouses.map((w) => (
                            <option value={w.id} key={w.id}>
                              {label(w)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Stock pool
                        <select disabled={openingLines.length > 0}
                          value={inv?.id || ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              inventory_id: e.target.value,
                              lot_id: "",
                              bin_id: "",
                              confirmed: false,
                            }))
                          }
                        >
                          <option value="">No existing balance</option>
                          {data.inventory
                            .filter(
                              (i) =>
                                i.sku === form.sku &&
                                i.warehouse_id === form.warehouse_id,
                            )
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.owner_type || "Unite"} · {i.on_hand} on hand
                                / {i.reserved || 0} reserved
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Existing lot
                      <select
                        value={form.lot_id}
                        onChange={(e) => chooseLot(e.target.value)}
                      >
                        <option value="">
                          {mode === "receive"
                            ? "New receipt lot"
                            : "Select lot / first opening count"}
                        </option>
                        {lots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lot_number} · {l.qty_remaining} eaches ·{" "}
                            {l.expiration_date || "No expiry"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="wm-scanrow">
                      <label>
                        Location
                        <select
                          value={form.bin_id}
                          onChange={(e) => set("bin_id", e.target.value)}
                        >
                          <option value="">Select location</option>
                          {bins.map((b) => (
                            <option key={b.id} value={b.id}>
                              {label(b)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button onClick={() => scan("location")}>
                        Scan location
                      </button>
                    </div>
                    </details>
                    <h3 className="wm-step">
                      <span>03</span> Count & traceability
                    </h3>
                    {mode === 'count' && <div className="wm-count-scope"><strong>{form.lot_id ? 'Count the entire selected lot' : 'Opening inventory count'}</strong><p>{form.lot_id ? 'Include every pallet, case and loose unit belonging to this lot at this location. The total will replace the lot balance after review.' : 'For a first opening count, include the entire SKU balance in this warehouse. All units must share this lot and location.'}</p>{form.container_id && <p>Scanned container: <b>{form.container_id}</b>. This identifies the stock; it does not limit the count to this pallet.</p>}</div>}
                    {mode === 'count' && form.lot_id && <label className="wm-check"><input type="checkbox" checked={!!form.lot_scope_confirmed} onChange={e=>set('lot_scope_confirmed',e.target.checked)}/>I am counting the complete lot, including all of its containers.</label>}
                    <div className="wm-grid">
                      <QuantityField label="Full cases" value={form.cases} onChange={v=>set('cases',v)}/>
                      <QuantityField label="Loose eaches" value={form.eaches} onChange={v=>set('eaches',v)}/>
                      <label>
                        Eaches per case
                        <input
                          inputMode="numeric"
                          value={form.units_per_case}
                          onChange={(e) =>
                            set("units_per_case", e.target.value)
                          }
                        />
                      </label>
                    </div>
                    {mode === "count" &&
                      inv &&
                      baseline?.snapshot !== inv.snapshot && (
                        <p className="wm-alert">
                          Stock changed since this count started.{" "}
                          <button
                            onClick={() => {
                              setBaseline({
                                id: inv.id,
                                snapshot: inv.snapshot,
                              });
                              setForm((f) => ({
                                ...f,
                                cases: "0",
                                eaches: "",
                                confirmed: false,
                              }));
                            }}
                          >
                            Start a fresh count
                          </button>
                        </p>
                      )}
                    <p className="wm-total">
                      {quantityReady
                        ? `${total} eaches total`
                        : "Enter quantities and confirm the case size."}
                    </p>
                    {Number(form.cases) > 0 && (
                      <label className="wm-check">
                        <input
                          type="checkbox"
                          checked={form.pack_confirmed}
                          onChange={(e) =>
                            set("pack_confirmed", e.target.checked)
                          }
                        />
                        I checked the case quantity on the packaging.
                      </label>
                    )}
                    <div className="wm-grid">
                      <label>
                        Lot / batch
                        <input
                          value={form.lot_number}
                          onChange={(e) => set("lot_number", e.target.value)}
                        />
                      </label>
                      <label>
                        Expiration (YYYY-MM-DD or N/A)
                        <input
                          placeholder="2028-06-30"
                          value={form.expiration_date}
                          onChange={(e) =>
                            set("expiration_date", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Serial{" "}
                        {product?.policy.serial === "required"
                          ? "(required)"
                          : ""}
                        <input
                          value={form.serial_number}
                          onChange={(e) => set("serial_number", e.target.value)}
                        />
                      </label>
                      <label>
                        UDI{" "}
                        {product?.policy.udi === "required" ? "(required)" : ""}
                        <input
                          value={form.udi}
                          onChange={(e) => set("udi", e.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      N/A explanation
                      <input
                        value={form.not_applicable_reason}
                        onChange={(e) =>
                          set("not_applicable_reason", e.target.value)
                        }
                      />
                    </label>
                    {mode === "count" && (
                      <>
                        <label>
                          Count reason / discrepancy
                          <textarea
                            value={form.reason}
                            onChange={(e) => set("reason", e.target.value)}
                          />
                        </label>
                        {!lots.length && openingLines.length === 0 && (
                          <label className="wm-check">
                            <input
                              type="checkbox"
                              checked={form.whole_sku_confirmed}
                              onChange={(e) =>
                                set("whole_sku_confirmed", e.target.checked)
                              }
                            />
                            This is the entire SKU balance in this warehouse and
                            owner pool; all units have this lot and location.
                          </label>
                        )}
                      </>
                    )}
                    {mode === "receive" && (
                      <label>
                        Purchase order
                        <select
                          value={form.po_id}
                          onChange={(e) => set("po_id", e.target.value)}
                        >
                          <option value="">Select receiving PO</option>
                          {data.purchase_orders
                            .filter((p) =>
                              p.line_items.some((l) => l.sku === form.sku),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.id} · {p.vendor_name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {mode === "pick" && (
                      <>
                        <label>
                          Order
                          <select
                            value={form.order_id}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                order_id: e.target.value,
                                order_item_id: "",
                                confirmed: false,
                              }))
                            }
                          >
                            <option value="">Select order</option>
                            {data.orders.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.order_number || o.name || o.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Order line
                          <select
                            value={form.order_item_id}
                            onChange={(e) =>
                              set("order_item_id", e.target.value)
                            }
                          >
                            <option value="">Select line</option>
                            {data.order_items
                              .filter(
                                (i) =>
                                  i.order_id === form.order_id &&
                                  (i.inventory_sku || i.sku) === form.sku,
                              )
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.sku} · {i.qty} eaches ordered
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Source case / pallet
                          <select
                            value={form.container_id}
                            onChange={(e) =>
                              set("container_id", e.target.value)
                            }
                          >
                            <option value="">No tracked container</option>
                            {data.containers
                              .filter((c) => c.lot_id === form.lot_id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.id} · {c.units_remaining} remain
                                </option>
                              ))}
                          </select>
                        </label>
                        <p>
                          Picking removes units from the case. Warehouse on-hand
                          decreases once, at the order’s custody handoff in the
                          staff portal.
                        </p>
                      </>
                    )}
                    <label className="wm-check">
                      <input
                        type="checkbox"
                        checked={form.confirmed}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            confirmed: e.target.checked,
                          }))
                        }
                      />
                      I physically checked this product, location, quantity,
                      packaging and traceability.
                    </label>
                    {mode === 'count' && !lots.length && inv && <div className="wm-opening-sheet">
                      <p className="wm-eyebrow">MULTIPLE LOTS OR LOCATIONS?</p><h3>Opening inventory worksheet</h3><p>Add each lot and location as a line. Submit once, after the complete SKU has been counted across the warehouse.</p>
                      <button disabled={openingLines.length>=100 || !warehouseFormState({form:{...form,whole_sku_confirmed:true},product,mode,inventory:inv,baseline,lots,containers:data.containers}).ready} onClick={()=>{
                        const duplicate=openingLines.some(l=>l.bin_id===form.bin_id && l.lot_number.trim()===form.lot_number.trim() && l.serial_number.trim()===form.serial_number.trim());
                        if(duplicate){setError('That lot and location is already in the worksheet. Remove its line and enter the combined quantity.');return;}
                        setOpeningLines(lines=>[...lines,{...form,cases:Number(form.cases),eaches:Number(form.eaches),units_per_case:Number(form.units_per_case),units:total}]);
                        setOpeningConfirmed(false);setDirtyTabs(t=>({...t,scan:true}));
                        setForm(f=>({...initial,sku:f.sku,inventory_id:inv.id,warehouse_id:f.warehouse_id,units_per_case:f.units_per_case,reason:f.reason}));
                        setNotice('Line added to this device’s worksheet. Continue with the next lot/location, or submit the complete opening total.');
                      }}>Add this line to worksheet</button>
                      {openingLines.map((line,i)=><article key={i}><strong>{label(data.bins.find(b=>b.id===line.bin_id))} · {line.lot_number} · {line.units} eaches</strong><p>Expires {line.expiration_date}</p><button onClick={()=>{setOpeningLines(lines=>lines.filter((_,index)=>index!==i));setOpeningConfirmed(false);}}>Remove line {i+1}</button></article>)}
                      {openingLines.length>0 && <><p className="wm-total">{openingLines.reduce((n,l)=>n+l.units,0).toLocaleString()} eaches across {openingLines.length} lines</p><label className="wm-check"><input type="checkbox" checked={openingConfirmed} onChange={e=>setOpeningConfirmed(e.target.checked)}/>This worksheet includes the entire SKU balance in this warehouse and owner pool. Every lot and location has been physically counted.</label><button className="wm-primary" disabled={!openingConfirmed || form.eaches!=='' || Number(form.cases)>0 || baseline?.snapshot!==inv.snapshot || !form.reason.trim()} onClick={async()=>{
                        const saved=await submit({action:'opening_count',inventory_id:inv.id,snapshot:baseline.snapshot,allocations:openingLines,reason:form.reason,whole_sku_confirmed:true,confirmed:true});
                        if(saved){setOpeningLines([]);setOpeningConfirmed(false);setForm({...initial,warehouse_id:form.warehouse_id});setBaseline(null);}
                      }}>Submit complete opening worksheet</button><p className="wm-hint">Add or clear the current quantity fields before submitting. Lines stay in this browser tab until submitted; only a server confirmation means the count was saved.</p></>}
                    </div>}
                    <div
                      className="wm-readiness"
                      id="wm-readiness"
                      aria-live="polite"
                    >
                      <strong>
                        {ready ? "Ready to submit" : "Before you continue"}
                      </strong>
                      {issues.length > 0 && (
                        <ul>
                          {issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      className="wm-primary"
                      disabled={
                        !ready || openingLines.length > 0 || busy || hasPending || Boolean(connectionError)
                      }
                      aria-describedby="wm-readiness"
                      onClick={async () => {
                        const saved = await submit({
                          ...form,
                          action: mode,
                          inventory_id: inv?.id,
                          snapshot: baseline?.snapshot,
                          barcode: form.raw_barcode,
                          cases: Number(form.cases),
                          eaches: Number(form.eaches),
                          units_per_case: Number(form.units_per_case),
                          scan_count: total,
                        });
                        if (saved) { setForm({...initial,warehouse_id:form.warehouse_id,bin_id:form.bin_id}); setBaseline(null); setSuggestion(null); }
                      }}
                    >
                      {busy
                        ? "Saving…"
                        : mode === "count"
                          ? "Submit count for review"
                          : mode === "receive"
                            ? "Confirm receipt"
                            : "Confirm pick"}
                    </button>
                    <p className="wm-hint">
                      Counts retain the original evidence. A manager reviews
                      variances before stock changes. Unrecognized products and
                      incomplete details cannot be submitted.
                    </p>
                  </fieldset>
                </section>
                <aside className="wm-card wm-capture-aside">
                  <p className="wm-eyebrow">YOUR COUNT</p><h2>{product?.name || 'Choose a product to begin'}</h2><div className="wm-capture-total"><strong>{quantityReady ? total.toLocaleString() : '—'}</strong><span>physical eaches</span></div><p>{label(data.bins.find(b=>b.id===form.bin_id)) || 'No location selected'}{form.lot_number ? ' · Lot ' + form.lot_number : ''}</p><p className="wm-hint">Saved counts go to review. Stock changes only when a manager posts the count.</p>
                  <p className="wm-eyebrow">ASSISTED CAPTURE</p>
                  <h2>Read a label or photo</h2>
                  <p>
                    AI can suggest printed lot, expiry and case details, or
                    estimate visible cases. Hidden stock cannot be counted from
                    a photo.
                  </p>
                  <label className="wm-photo">
                    Choose photo for AI review
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      capture="environment"
                      disabled={busy}
                      onChange={(e) => readPhoto(e.target.files[0])}
                    />
                  </label>
                  <p className="wm-hint">
                    The selected photo is sent to OpenAI for analysis.
                    Suggestions never update stock automatically.
                  </p>
                  {suggestion && (
                    <div className="wm-suggestion">
                      <h3>Review the suggestion</h3>
                      {Object.entries(suggestion).map(([k, v]) => (
                        <p key={k}>
                          <strong>
                            {{
                              container_id: "Container ID",
                              units_per_case: "Eaches per case",
                              units_remaining: "Eaches remaining",
                            }[k] || k.replaceAll("_", " ")}
                            :
                          </strong>{" "}
                          {v ?? "Not readable"}
                        </p>
                      ))}
                      <button
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            lot_number: suggestion.lot_number || f.lot_number,
                            expiration_date:
                              suggestion.expiration_date || f.expiration_date,
                            units_per_case:
                              suggestion.units_per_case > 0
                                ? String(suggestion.units_per_case)
                                : f.units_per_case,
                            confirmed: false,
                            pack_confirmed: false,
                            capture_method: "ai_reviewed",
                          }));
                          setNotice(
                            "Label suggestions copied. Verify them against the package; count is unchanged.",
                          );
                        }}
                      >
                        Use label fields, then check them
                      </button>
                      {suggestion.visible_cases != null && (
                        <button
                          onClick={() => {
                            set("cases", String(suggestion.visible_cases));
                            setNotice(
                              "Visible-case estimate copied. Edit it and physically confirm the total.",
                            );
                          }}
                        >
                          Use editable visible-case estimate
                        </button>
                      )}
                    </div>
                  )}
                </aside>
              </div>
            )}
            {tab === "cases" && (
              <div className="wm-columns">
                <section className="wm-card">
                  <h2>Identify a case or pallet</h2>
                  <p>
                    A product barcode identifies the SKU. A unique container ID
                    identifies this particular box or pallet. Register either
                    the pallet as one container or its individual cases, never
                    both for the same units.
                  </p>
                  <fieldset
                    disabled={busy || hasPending || Boolean(connectionError)}
                  >
                    {["container_id", "units_per_case", "units_remaining"].map(
                      (k) => (
                        <label key={k}>
                          {{
                            container_id: "Container ID",
                            units_per_case: "Eaches per case",
                            units_remaining: "Eaches remaining",
                          }[k] || k.replaceAll("_", " ")}
                          <input
                            value={box[k]}
                            inputMode={
                              k.startsWith("units") ? "numeric" : "text"
                            }
                            onChange={(e) =>
                              setBox((b) => ({
                                ...b,
                                [k]: e.target.value,
                                confirmed: false,
                              }))
                            }
                          />
                        </label>
                      ),
                    )}
                    <label>
                      Lot
                      <select
                        value={box.lot_id}
                        onChange={(e) =>
                          setBox((b) => ({
                            ...b,
                            lot_id: e.target.value,
                            bin_id:
                              data.lots.find((l) => l.id === e.target.value)
                                ?.bin_id || "",
                            confirmed: false,
                          }))
                        }
                      >
                        <option value="">Select lot</option>
                        {data.lots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.product_sku} · {l.lot_number} · {l.qty_remaining}{" "}
                            eaches
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Location
                      <select
                        value={box.bin_id}
                        onChange={(e) =>
                          setBox((b) => ({
                            ...b,
                            bin_id: e.target.value,
                            confirmed: false,
                          }))
                        }
                      >
                        <option value="">Select location</option>
                        {data.bins
                          .filter(
                            (b) =>
                              b.warehouse_id ===
                              data.lots.find((l) => l.id === box.lot_id)
                                ?.warehouse_id,
                          )
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {label(b)}
                            </option>
                          ))}
                      </select>
                    </label>
                    {[
                      ["kind", ["case", "pallet"]],
                      ["state", ["sealed", "open"]],
                    ].map(([k, values]) => (
                      <label key={k}>
                        {k === "kind" ? "Container type" : "Packaging state"}
                        <select
                          value={box[k]}
                          onChange={(e) =>
                            setBox((b) => ({
                              ...b,
                              [k]: e.target.value,
                              confirmed: false,
                            }))
                          }
                        >
                          {values.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label className="wm-check">
                      <input
                        type="checkbox"
                        checked={box.confirmed}
                        onChange={(e) =>
                          setBox((b) => ({ ...b, confirmed: e.target.checked }))
                        }
                      />
                      I checked this container and its remaining units.
                    </label>
                    <button
                      className="wm-primary"
                      disabled={
                        !box.confirmed ||
                        !box.container_id ||
                        !box.lot_id ||
                        !box.bin_id ||
                        !whole(box.units_remaining) ||
                        !whole(box.units_per_case) ||
                        Number(box.units_per_case) < 1 ||
                        Number(box.units_per_case) > 1e9 ||
                        Number(box.units_remaining) > 1e9 ||
                        (box.kind === "case" &&
                          (Number(box.units_remaining) >
                            Number(box.units_per_case) ||
                            (box.state === "sealed" &&
                              Number(box.units_remaining) !==
                                Number(box.units_per_case))))
                      }
                      onClick={() =>
                        submit({
                          action: "container",
                          ...box,
                          units_remaining: Number(box.units_remaining),
                          units_per_case: Number(box.units_per_case),
                        })
                      }
                    >
                      Save container
                    </button>
                  </fieldset>
                </section>
                <section className="wm-card">
                  <h2>Opened stock</h2>
                  {!data.containers.length && (
                    <div className="wm-empty">
                      <WorkspaceIcon name="inbox" size={26} />
                      <p>
                        No containers registered yet. Add a unique case or
                        pallet ID to track its remaining eaches.
                      </p>
                    </div>
                  )}
                  {data.containers.map((c) => (
                    <article key={c.id}>
                      <h3>
                        {c.id} · {c.state}
                      </h3>
                      <p>
                        {c.sku} · {c.units_remaining} eaches remaining ·{" "}
                        {c.units_picked || 0} picked
                      </p>
                      {c.needs_recount && (
                        <p className="wm-alert">
                          Recount this container after the lot adjustment.
                        </p>
                      )}
                      <button onClick={() => editContainer(c)}>
                        Check / open / edit
                      </button>
                    </article>
                  ))}
                </section>
              </div>
            )}
            {tab === "tasks" && (
              <div className="wm-columns">
                <section className="wm-card">
                  <h2>Count queue</h2>
                  {!data.tasks.length && (
                    <div className="wm-empty">
                      <WorkspaceIcon name="inbox" size={26} />
                      <p>
                        No counts assigned. New verification tasks and deadlines
                        will appear here.
                      </p>
                    </div>
                  )}
                  {data.tasks.map((t) => (
                    <article key={t.id}>
                      <h3>
                        {t.sku} · {t.status}
                      </h3>
                      <p>{t.reason}</p>
                      <p>
                        {t.urgent ? "Urgent · " : ""}
                        {Date.parse(t.due_at) < Date.parse(data.server_time) &&
                        t.status === "open"
                          ? "Overdue · "
                          : ""}
                        Due {new Date(t.due_at).toLocaleString()}
                      </p>
                      {t.status === "open" && (
                        <button
                          disabled={busy || hasPending || !!dirtyTabs.scan}
                          onClick={() => {
                            setForm({
                              ...initial,
                              sku: t.sku,
                              warehouse_id: t.warehouse_id,
                              task_id: t.id,
                              reason: t.reason,
                            });
                            setMode("count");
                            setTab("scan");
                          }}
                        >
                          Start count
                        </button>
                      )}
                    </article>
                  ))}
                  {!data.tasks.length && <p>No assigned count tasks.</p>}
                  {managers && (
                    <>
                      <h3>Assign a count</h3>
                      <label>
                        Staff
                        <select
                          value={task.assigned_to}
                          onChange={(e) =>
                            setTask((t) => ({
                              ...t,
                              assigned_to: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose staff</option>
                          {data.staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name || s.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        SKU
                        <select
                          value={task.sku}
                          onChange={(e) =>
                            setTask((t) => ({ ...t, sku: e.target.value }))
                          }
                        >
                          <option value="">Choose SKU</option>
                          {data.products.map((p) => (
                            <option key={p.id} value={p.sku}>
                              {p.sku}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Warehouse
                        <select
                          value={task.warehouse_id}
                          onChange={(e) =>
                            setTask((t) => ({
                              ...t,
                              warehouse_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose warehouse</option>
                          {data.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {label(w)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Reason
                        <input
                          value={task.reason}
                          onChange={(e) =>
                            setTask((t) => ({ ...t, reason: e.target.value }))
                          }
                        />
                      </label>
                      <label className="wm-check">
                        <input
                          type="checkbox"
                          checked={task.urgent}
                          onChange={(e) =>
                            setTask((t) => ({ ...t, urgent: e.target.checked }))
                          }
                        />
                        Urgent — 24-hour deadline
                      </label>
                      <button
                        disabled={
                          busy ||
                          !task.assigned_to ||
                          !task.sku ||
                          !task.warehouse_id ||
                          !task.reason
                        }
                        onClick={() => submit({ action: "task", ...task })}
                      >
                        Assign task
                      </button>
                    </>
                  )}
                </section>
                <section className="wm-card">
                  <h2>Count history & approvals</h2>
                  {!data.counts.length && (
                    <div className="wm-empty">
                      <WorkspaceIcon name="inbox" size={26} />
                      <p>
                        No counts submitted yet. Completed checks and manager
                        approvals will appear here.
                      </p>
                    </div>
                  )}
                  {data.counts.toReversed().map((c) => (
                    <article key={c.id}>
                      <h3>
                        {c.sku} · {c.units} eaches
                      </h3>
                      <p>
                        Lot {c.lot_number} · variance{" "}
                        {c.variance > 0 ? "+" : ""}
                        {c.variance} · {c.status}
                      </p>
                      <p>
                        {new Date(c.counted_at).toLocaleString()} ·{" "}
                        {c.counted_by}
                      </p>
                      <p>{c.reason}</p>
                      {c.status === "pending" && managers && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            submit({ action: "approve_count", count_id: c.id })
                          }
                        >
                          Approve and update stock
                        </button>
                      )}
                      {managers && c.status==='pending' && <button disabled={busy || hasPending || !!connectionError} onClick={()=>submit({action:'reject_count',count_id:c.id})}>Return for recount</button>}
                      {!c.allocations && <button
                        disabled={busy || hasPending || !!dirtyTabs.scan}
                        onClick={() => {
                          setForm({
                            ...initial,
                            sku: c.sku,
                            inventory_id: c.inventory_id,
                            warehouse_id: c.warehouse_id,
                            bin_id: c.bin_id,
                            lot_id: c.posted_lot_id || c.lot_id || "",
                            lot_number: c.lot_number,
                            expiration_date: c.expiration_date || "N/A",
                            corrects_id: c.id,
                            reason: "Correction: ",
                          });
                          setMode("count");
                          setTab("scan");
                        }}
                      >
                        Record a correction
                      </button>}
                      {c.allocations && <div><p>Opening worksheet · {c.allocations.length} lot/location lines</p>{c.allocations.map((a,i)=><p key={i}>{label(data.bins.find(b=>b.id===a.bin_id))} · {a.lot_number} · {a.units} eaches</p>)}</div>}
                    </article>
                  ))}
                </section>
              </div>
            )}
            {tab === "map" && (
              <div className="wm-spatial-layout">
                <section className="wm-card wm-spatial-main">
                  <h2>Warehouse map</h2>
                  <div className="wm-layout-actions"><button disabled={busy || !!scanArea} onClick={startArea}><WorkspaceIcon name="grid" size={18}/>Scan space with LiDAR</button><span>Native iPad Pro app</span></div>
                  {managers && <details className="wm-manual-layout"><summary>Create an area without LiDAR</summary><p>Enter approximate dimensions in meters, then place and label locations. This is a manual layout, not a measured scan.</p><label>Area name<input value={manualLayout.name} placeholder="Receiving / aisle A" onChange={e=>setManualLayout(f=>({...f,name:e.target.value}))}/></label><label>Warehouse<select value={manualLayout.warehouse_id} onChange={e=>setManualLayout(f=>({...f,warehouse_id:e.target.value}))}><option value="">Choose warehouse</option>{data.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><div className="wm-grid"><label>Width (meters)<input inputMode="decimal" value={manualLayout.width} onChange={e=>setManualLayout(f=>({...f,width:e.target.value}))}/></label><label>Depth (meters)<input inputMode="decimal" value={manualLayout.depth} onChange={e=>setManualLayout(f=>({...f,depth:e.target.value}))}/></label></div><button disabled={busy || hasPending || !!connectionError || !manualArea(manualLayout.name,manualLayout.warehouse_id,manualLayout.width,manualLayout.depth)} onClick={async()=>{const area=manualArea(manualLayout.name,manualLayout.warehouse_id,manualLayout.width,manualLayout.depth);if(!area)return;const saved=await submit({action:'map',...area});if(saved){setMapId(saved.result.map_id);setManualLayout({name:'',warehouse_id:'',width:'12',depth:'18'});}}}>Create area layout</button></details>}
                  <p>Each scan is a separate area. Pallet symbols are linked to registered locations; they are not automatic object detections.</p>
                  <div className="wm-map-legend"><span data-status="complete">Complete</span><span data-status="missing">Missing information</span><span data-status="shipping">Shipping out</span><span data-status="hold">Hold / expired</span></div>
                  {scanArea && (
                    <>
                      <h3>Scan captured · {scanArea.surfaces.length} surfaces</h3>{!managers && <p>A warehouse manager must publish this structural scan. The native 3D model is also kept in Saved 3D scans on this device.</p>}<p>Name this area and choose its warehouse to share the map with your team.</p><WarehouseMap3D map={scanArea} locations={[]} placing={false} onSelect={() => {}} onPoint={() => {}}/>
                      <label>
                        Area name
                        <input
                          value={scanArea.name || ""}
                          onChange={(e) =>
                            setScanArea((s) => ({ ...s, name: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Warehouse
                        <select
                          value={scanArea.warehouse_id || ""}
                          onChange={(e) =>
                            setScanArea((s) => ({
                              ...s,
                              warehouse_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select warehouse</option>
                          {data.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {label(w)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        disabled={
                          !managers ||
                          !scanArea.name ||
                          !scanArea.warehouse_id ||
                          busy
                        }
                        onClick={async () => {
                          const d = await submit({
                            action: "map",
                            ...scanArea,
                          });
                          if (d) {
                            setMapId(d.result.map_id);
                            setScanArea(null);
                          }
                        }}
                      >
                        Save area map
                      </button>
                    </>
                  )}
                  <label>
                    Saved area
                    <select data-filter
                      value={map?.id || ""}
                      onChange={(e) => {
                        setMapId(e.target.value);
                        setPoint(null); setSelectedBin(""); setPlacing(false);
                      }}
                    >
                      {data.maps.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {map ? <>
                    <WarehouseMap3D map={map} locations={locations} point={point} placing={placing} onPoint={setPoint} onSelect={setSelectedBin}/>
                    {map.source === 'manual_layout' && <p>Manual layout: dimensions and wall heights are approximate.</p>}
                    {map.surfaces.some((s) => s.height == null) && <p>Older scan: wall heights are illustrative. Rescan for measured heights.</p>}
                    {managers && <button aria-pressed={placing} onClick={() => {setPlacing(!placing);setPoint(null);}}>{placing ? "Cancel placement" : "Place a location"}</button>}
                  </> : <div className="wm-map-empty"><WorkspaceIcon name="grid" size={48}/><h3>Start with a walk around the warehouse</h3><p>Tap Scan warehouse above. Move slowly along walls and corners, then tap Finish scan to review the model.</p><p>LiDAR captures the structure. Scan a pallet label and confirm the contents to connect stock to it.</p></div>}
                  {point && managers && (
                    <>
                      <p>
                        Selected position: {point.x.toFixed(2)} m,{" "}
                        {point.z.toFixed(2)} m
                      </p>
                      <label>
                        Location ID
                        <input
                          placeholder="A-01-BIN-02"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || !code}
                        onClick={async () => {
                          const saved = await submit({
                            action: "location",
                            map_id: map.id,
                            code,
                            ...point,
                          }); if (saved) {setPoint(null);setPlacing(false);setCode("");setSelectedBin(saved.result.bin_id);}
                        }}
                      >
                        Save location
                      </button>
                    </>
                  )}
                </section>
                <section className="wm-card wm-spatial-details">
                  <h2>{selectedLocation ? label(selectedLocation) : "Pallets & locations"}</h2>
                  <p>{selectedLocation ? "Recorded stock at this location" : "Tap a colored location in the model or choose one below."}</p>
                  {!locations.length && <p>No registered locations in this area. Place a location in the model and give the physical position the same label.</p>}
                  {locations.map((b) => <button className="wm-location-row" aria-pressed={selectedBin === b.id} key={b.id} onClick={() => setSelectedBin(b.id)}><i style={{background:b.color}}/><span>{label(b)}<small>{b.containers.length} containers · {b.status === "missing" ? "Needs information" : b.status}</small></span></button>)}
                  {selectedLocation && <>
                    <button className="wm-scan-primary" disabled={busy || hasPending} onClick={() => scanAt(selectedLocation)}>Scan label & count here</button>
                    {!selectedLocation.containers.length && <p>Stock has not been linked here yet. Count the physical stock, then register its pallet or case.</p>}
                    {selectedLocation.containers.map((c) => <article key={c.id} className="wm-pallet-detail">
                      <h3><i style={{background:c.color}}/>{c.id}</h3><p>{c.kind} · {c.state} · {c.sku}</p>
                      <strong>{c.units_remaining} eaches remaining</strong><p>{c.units_per_case} per case · Lot {c.lot?.lot_number || "missing"}</p>
                      {c.issues.map((issue) => <p className="wm-missing" key={issue}>{issue}</p>)}
                      {c.outgoing.length > 0 && <p>{c.outgoing.reduce((n,p)=>n+Number(p.units_verified || 0),0)} eaches picked for outgoing orders. Blue indicates verified picks, not shipment completion.</p>}
                      <button onClick={() => editContainer(c)}>Check / edit this container</button>
                    </article>)}
                  </>}
                  {data.containers.some((c) => !data.bins.some((b) => b.id === c.bin_id && b.map_id)) && <p>Some containers have no mapped location and cannot be placed in 3D yet. Review Cases & pallets.</p>}
                </section>
              </div>
            )}
          </>
        )}
        <footer>
          <WorkspaceIcon name="shield" size={15} />
          <span>
            Every confirmed action is linked to your account and recorded on the
            server.
          </span>
          {data && (
            <time dateTime={data.server_time}>
              Last synced{" "}
              {new Date(data.server_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </footer>
      </main>
    </AdminShell>
  );
}

function ScanIcon(){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7v10m3-10v10m4-10v10m3-10v10"/></svg>;}
function QuantityField({label,value,onChange}){return <label>{label}<span className="wm-quantity"><button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!/^\d+$/.test(value)||Number(value)<1} onClick={()=>onChange(String(Number(value)-1))}>−</button><input aria-label={label} inputMode="numeric" pattern="[0-9]*" placeholder="0" value={value} onChange={e=>onChange(e.target.value)}/><button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value!==''&&!/^\d+$/.test(value)||Number(value)>=1e9} onClick={()=>onChange(String(Number(value||0)+1))}>+</button></span></label>;}
