const text = (value) => String(value ?? "").trim();
const na = (value) => /^(?:n\/?a|not[ _-]?applicable)$/i.test(text(value));
const whole = (value) =>
  /^\d+$/.test(text(value)) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) <= 1e9;
export function calendarDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function warehouseFormState({
  form,
  product,
  mode,
  inventory,
  baseline,
  lots = [],
  containers = [],
}) {
  const issues = [],
    factor = Number(form.units_per_case);
  const total =
    Number(form.cases || 0) * (Number(form.cases) > 0 ? factor : 0) +
    Number(form.eaches || 0);
  const quantityReady =
    whole(form.cases) &&
    whole(form.eaches) &&
    (Number(form.cases) === 0 ||
      (whole(form.units_per_case) &&
        factor > 0 &&
        ((product?.pack_verified && factor === product.units_per_case) ||
          form.pack_confirmed))) &&
    Number.isSafeInteger(total) &&
    total <= 1e9;
  if (!product) issues.push("Scan or select a catalog product.");
  if (!form.warehouse_id) issues.push("Choose a warehouse.");
  if (!form.bin_id) issues.push("Choose a registered location.");
  if (!quantityReady)
    issues.push("Enter whole cases and eaches, and verify the case size.");
  if (mode !== "count" && quantityReady && total < 1)
    issues.push("Enter at least one each.");
  if (mode !== "pick") {
    if (
      !text(form.lot_number) ||
      (product?.policy.lot === "required" && na(form.lot_number))
    )
      issues.push("Enter the required lot or batch number.");
    if (
      !(
        calendarDate(form.expiration_date) ||
        (na(form.expiration_date) && product?.policy.expiration !== "required")
      )
    )
      issues.push(
        "Enter a valid expiration date" +
          (product?.policy.expiration === "required" ? "." : " or N/A."),
      );
    if (
      (na(form.lot_number) || na(form.expiration_date)) &&
      !text(form.not_applicable_reason)
    )
      issues.push("Explain why traceability is not applicable.");
    if (product?.policy.serial === "required" && !text(form.serial_number))
      issues.push("Enter the required serial number.");
    if (product?.policy.udi === "required" && !text(form.udi))
      issues.push("Enter the required UDI.");
  }
  if (mode === "count") {
    if (form.lot_id && form.lot_scope_confirmed !== true)
      issues.push("Confirm you counted the complete lot, including every container.");
    if (!inventory)
      issues.push("This product needs an existing stock balance to count.");
    else if ((inventory.owner_type || "unite") !== "unite")
      issues.push("Use the consignment workspace for distributor stock.");
    else if (baseline?.snapshot !== inventory.snapshot)
      issues.push("Stock changed. Start a fresh count.");
    if (!text(form.reason))
      issues.push("Add a count reason or discrepancy note.");
    if (!form.lot_id && !(lots.length === 0 && form.whole_sku_confirmed))
      issues.push(
        lots.length
          ? "Choose the lot being counted."
          : "Confirm this is the complete opening balance.",
      );
  }
  if (mode === "receive" && !form.po_id)
    issues.push("Choose the purchase order.");
  if (mode === "pick") {
    if (!form.raw_barcode)
      issues.push("Scan the product barcode for this pick.");
    if (!form.order_id || !form.order_item_id)
      issues.push("Choose the order and matching line.");
    if (!form.lot_id) issues.push("Choose the physical lot being picked.");
    if (containers.some((c) => c.lot_id === form.lot_id) && !form.container_id)
      issues.push("Choose the source case or pallet.");
  }
  if (!form.confirmed) issues.push("Confirm the physical check.");
  return { issues, total, quantityReady, ready: issues.length === 0 };
}
