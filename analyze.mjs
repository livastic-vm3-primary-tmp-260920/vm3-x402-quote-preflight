export const CHAIN="eip155:8453";
export const NATIVE_BASE_USDC="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const PAID_PRICE_USDC="0.010000";
export const VERSION="vm3-x402-public-quote-offline-qa-v1";
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const PRIVATE=/"(?:authorization|x-payment|payment-signature|cookie|set-cookie|private_key|privatekey|secret|seed_phrase|access_token)"\s*:/i;
const pubPayTo="0xfCbE632f37F760218216b37df52f0d73f9020234";
export const EXAMPLE_QUOTE=Object.freeze({
  x402Version:2,
  resource:{url:"https://example.invalid/demo",description:"PUBLIC SYNTAX EXAMPLE, not a real merchant",mimeType:"application/json"},
  accepts:[{scheme:"exact",network:CHAIN,amount:"10000",asset:NATIVE_BASE_USDC,payTo:pubPayTo}]
});
function bad(code){const e=new Error(code);e.code=code;throw e;}
function isObj(x){return x!==null && typeof x==="object" && !Array.isArray(x);}
export function parsePublicQuote(raw){
  if(raw===undefined||raw===null||raw==="")return EXAMPLE_QUOTE;
  if(typeof raw!=="string"||raw.length>12000||raw.length<15)bad("QUOTE_LENGTH_INVALID");
  if(raw.includes("%")&&/%(?![0-9a-fA-F]{2})/.test(raw))bad("QUOTE_INVALID_URL_ENCODING");
  let body;
  // URL-safe/base64 or raw JSON. Inputs are never returned verbatim or logged.
  if(raw.trimStart().startsWith("{")){
    body=raw;
  }else{
    if(!/^[a-zA-Z0-9_+\/=-]+$/.test(raw))bad("QUOTE_BASE64_INVALID");
    const norm=raw.replace(/-/g,"+").replace(/_/g,"/");
    body=Buffer.from(norm,"base64").toString("utf8");
  }
  if(body.length>12000 || PRIVATE.test(body))bad("SIGNED_OR_SECRET_FIELDS_REJECTED");
  let j;
  try{j=JSON.parse(body);}catch{bad("QUOTE_JSON_INVALID");}
  if(!isObj(j))bad("QUOTE_NOT_OBJECT");
  if(!Array.isArray(j.accepts)||j.accepts.length<1||j.accepts.length>6)bad("QUOTE_ACCEPTS_INVALID");
  return j;
}
function formatAtomic(amount){
  if(typeof amount!=="string"||!/^\d{1,18}$/.test(amount))return null;
  const n=BigInt(amount);
  if(n<0n)return null;
  const integer=(n/1000000n).toString(),fraction=(n%1000000n).toString().padStart(6,"0");
  return integer+"."+fraction;
}
function getURL(x){
  try{
    if(typeof x!=="string"||x.length>1000)return null;
    const u=new URL(x);
    return u.protocol==="https:" && !u.username&&!u.password?u.origin+u.pathname:null;
  }catch{return null;}
}
export function evaluatePublicQuote(quote){
  if(!isObj(quote))bad("QUOTE_NOT_OBJECT");
  const results=[];
  function check(name,ok,note){
    results.push({check:name,result:ok===null?"unknown":ok?"pass":"fail",explanation:note});
  }
  check("x402 version 2",quote.x402Version===2,"Version 2 is expected for this preflight schema; this is not a protocol conformance certificate.");
  check("acceptance count exactly one",Array.isArray(quote.accepts)?quote.accepts.length===1:null,"Multiple accepted routes are ambiguous until the actual client selects a supported quote.");
  let a=(quote.accepts??[])[0]??{};
  if(!isObj(a))a={};
  check("exact scheme",a.scheme===undefined?null:a.scheme==="exact","Only the first public accepts entry is inspected here.");
  check("Base CAIP-2 network",a.network===undefined?null:a.network===CHAIN,"Comparison is limited to original Base chainId8453.");
  check("native Circle Base USDC asset",a.asset===undefined?null:typeof a.asset==="string"&&a.asset.toLowerCase()===NATIVE_BASE_USDC,"Public native Circle USDC address is expected, not wrapped/testnet asset.");
  const amount=formatAtomic(a.amount);
  check("atomic positive USDC amount",amount===null?false:BigInt(a.amount)>0n,"Atomic amount must be a positive integer (USDC has six decimals); this is not approval to pay.");
  check("public 20-byte payTo",a.payTo===undefined?null:ADDRESS.test(a.payTo),"Having an address does NOT prove who controls the seller.");
  const resourceURL=getURL(quote.resource?.url??quote.resourceUrl??quote.url);
  check("public HTTPS resource",resourceURL===null?null:true,"The URL is not fetched. No vendor authenticity checks were performed.");
  const failed=results.filter(x=>x.result==="fail").length;
  const unknown=results.filter(x=>x.result==="unknown").length;
  return {
    ok:true,paid:true,kind:"x402_v2_public_402_offline_quote_review",version:VERSION,
    chargedUSDC:PAID_PRICE_USDC,
    paymentNetwork:CHAIN,
    inspectedAccepts:Math.min(1,Array.isArray(quote.accepts)?quote.accepts.length:0),
    observations:{
      quotedNetwork:typeof a.network==="string"?a.network:null,
      quotedAsset:typeof a.asset==="string"?a.asset:null,
      quotedScheme:typeof a.scheme==="string"?a.scheme:null,
      quotedAmountUSDCForNativeBaseOnly:a.asset?.toLowerCase()===NATIVE_BASE_USDC?amount:null,
      payToFormatOnly:ADDRESS.test(a.payTo??""),
      resourceUrlPublicOnly:resourceURL
    },
    checkCount:results.length,failedChecks:failed,unknownChecks:unknown,checks:results,
    reviewOutcome:failed>0?"structural_inconsistency":unknown>0?"insufficient_public_evidence":"basic_public_structure_consistent",
    disclosure:"Buyer-supplied unsigned public HTTP402 terms ONLY. No live endpoint, settlement, keys, wallet, seller identity, actual response delivery, or security certification checked. A consistent public quote is NOT proof a seller is safe to pay.",
    nextSteps:["Use your own authorized x402 client to validate final returned quote and intended public resource URL.","Confirm payTo ownership and whether merchant service is trustworthy outside this offline report.","Verify final token receipt independently AFTER any authorized payment; never repeat a payment just because a seller returns another 402."],
    noSignedPaymentDataStored:true,noSpendingAuthorized:true
  };
}
