/** September 16 handoff: intake-only pilot; binding actions are disabled. */
export const BUYER_CHANNELS = [{id:'medical',label:'Verified US business',hard:false}];
export function brokerFee({total}) { const value=Number(total); if(!Number.isFinite(value)||value<0)throw new Error('Invalid merchandise value');return {pct:0.10,fee:Math.round(value*10)/100}; }
export const isHardToPlace = () => false;
export const listings = () => [];
export const offersFor = () => [];
function intakeOnly(){throw new Error('Surplus pilot is intake-only. Deals, fees and introductions are disabled.');}
export const publishSubmissionLines=intakeOnly,placeOffer=intakeOnly,acceptOffer=intakeOnly,confirmFeePaid=intakeOnly,declineOffer=intakeOnly,unlist=intakeOnly;
