const express = require("express");
const { all, collection, get, put } = require("../config/store");
const { requireAdmin } = require("../middleware/auth");
const router = express.Router();
const slugify = value => String(value).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

router.get("/", (req, res, next) => req.query.all === "true" ? requireAdmin(req, res, next) : next(), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").toLowerCase(), category = String(req.query.category || "");
    const rows = (await all("services")).filter(s => (req.query.all === "true" || s.active) && (!category || s.category === category) && (!q || [s.name, s.category, s.description].some(v => String(v || "").toLowerCase().includes(q)))).sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return res.json(rows);
  } catch (error) { next(error); }
});
router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const { name, category, icon, description, pricingModel = "fixed", startingPrice = null, workerPayment = null, active = true, serviceAreas = [] } = req.body || {};
    if (!name?.trim() || !category?.trim() || !description?.trim()) return res.status(400).json({ message: "Name, category and description are required." });
    if (typeof active !== "boolean" || !Array.isArray(serviceAreas) || serviceAreas.length > 30 || serviceAreas.some(x => typeof x !== "string" || x.length > 100)) return res.status(400).json({ message: "Invalid service settings." });
    if (pricingModel === "fixed" && (!Number.isFinite(Number(startingPrice)) || Number(startingPrice) < 0)) return res.status(400).json({ message: "A valid estimate is required for fixed-price services." });
    const slug = slugify(name); if (await get("services", slug)) return res.status(409).json({ message: "A service with that name already exists." });
    return res.status(201).json(await put("services", slug, { name: name.trim(), slug, category: category.trim(), icon: icon || "🛠️", description: description.trim(), pricingModel, startingPrice: pricingModel === "quote" ? null : Number(startingPrice), workerPayment: workerPayment == null ? null : Number(workerPayment), active, serviceAreas }));
  } catch (error) { next(error); }
});
router.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    const service = await get("services", req.params.id); if (!service) return res.status(404).json({ message: "Service not found." });
    const allowed = ["name", "category", "icon", "description", "pricingModel", "startingPrice", "workerPayment", "active", "serviceAreas"];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    if (updates.active !== undefined && typeof updates.active !== "boolean") return res.status(400).json({ message: "Active must be true or false." });
    if (updates.name !== undefined) updates.slug = slugify(updates.name);
    if (updates.pricingModel === "quote") updates.startingPrice = null;
    if (updates.startingPrice !== undefined && updates.startingPrice !== null && (!Number.isFinite(Number(updates.startingPrice)) || Number(updates.startingPrice) < 0)) return res.status(400).json({ message: "Invalid price estimate." });
    if (updates.startingPrice != null) updates.startingPrice = Number(updates.startingPrice);
    if (updates.workerPayment != null) updates.workerPayment = Number(updates.workerPayment);
    return res.json(await put("services", req.params.id, updates, true));
  } catch (error) { next(error); }
});
module.exports = router;
