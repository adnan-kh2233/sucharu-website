const express = require("express");
const bcrypt = require("bcryptjs");
const { all, collection, get, put } = require("../config/store");
const { requireAdmin } = require("../middleware/auth");
const router = express.Router(); router.use(requireAdmin);
const publicPartner = ({passwordHash, ...partner}) => partner;
router.get("/", async (req,res,next) => { try { return res.json((await all("partners")).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicPartner)); } catch(e){next(e);} });
router.post("/", async (req,res,next) => {
  try {
    const body=req.body||{}, name=String(body.name||"").trim(), phone=String(body.phone||"").replace(/[\s-]/g, "");
    const category=Array.isArray(body.category)?body.category.map(v=>String(v).trim()).filter(Boolean):[], area=Array.isArray(body.area)?body.area.map(v=>String(v).trim()).filter(Boolean):[];
    if(!name||name.length>120||!/^(?:\+?8801|01)[3-9]\d{8}$/.test(phone)||!category.length||category.length>20||area.length>30||category.some(v=>v.length>80)||area.some(v=>v.length>100)) return res.status(400).json({message:"Enter a valid partner name, Bangladesh phone number, at least one category and valid service areas."});
    if((await all("partners")).some(p=>p.phone===phone)) return res.status(409).json({message:"A partner already uses that phone number."});
    const id=collection("partners").doc().id, partnerId=`SP-${Date.now().toString(36).toUpperCase()}`;
    return res.status(201).json(await put("partners",id,{partnerId,name,phone,category,area,experienceYears:Number(body.experienceYears||0),hasTools:Boolean(body.hasTools),emergencyAvailable:Boolean(body.emergencyAvailable),portalEnabled:false,lastPortalLoginAt:null,verificationStatus:"pending",status:"inactive",completedJobs:0}));
  }catch(e){next(e);}
});
router.patch("/:id", async(req,res,next)=>{
  try{
    const partner=await get("partners",req.params.id); if(!partner)return res.status(404).json({message:"Partner not found."});
    const verificationStatus=req.body?.verificationStatus??partner.verificationStatus; let status=req.body?.status??partner.status;
    if(!new Set(["pending","in_review","verified","rejected"]).has(verificationStatus)||!new Set(["active","inactive","suspended"]).has(status))return res.status(400).json({message:"Choose a valid verification and partner status."});
    if(verificationStatus!=="verified"&&status==="active"){if(req.body?.status===undefined&&partner.status==="active")status="inactive";else return res.status(400).json({message:"Only verified partners can be active. Verify the partner first or set the status to inactive."});}
    if((verificationStatus!=="verified"||status!=="active")&&partner.verificationStatus==="verified"&&partner.status==="active"&&(await all("bookings")).some(b=>b.partner?.partnerId===partner._id&&!new Set(["completed","cancelled"]).has(b.status)))return res.status(409).json({message:"Reassign this partner's open bookings before making them inactive or changing verification status."});
    return res.json(publicPartner(await put("partners",partner._id,{verificationStatus,status},true)));
  }catch(e){next(e);}
});
router.patch("/:id/portal-access",async(req,res,next)=>{
  try{
    const partner=await get("partners",req.params.id);if(!partner)return res.status(404).json({message:"Partner not found."});
    if(partner.verificationStatus!=="verified"||partner.status!=="active")return res.status(409).json({message:"Verify and activate this partner before enabling portal access."});
    const password=String(req.body?.password||"");if(password.length<12||password.length>200)return res.status(400).json({message:"Set a unique password with at least 12 characters."});
    await put("partners",partner._id,{passwordHash:await bcrypt.hash(password,12),portalEnabled:true},true);return res.json({message:"Partner portal access enabled.",portalEnabled:true});
  }catch(e){next(e);}
});
module.exports=router;
