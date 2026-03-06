import { useState, useEffect } from 'react'

// --- Custom Hook to remember inputs across refreshes ---
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

// --- Helper to calculate "Next Quarter" from a Date string ---
const getNextQuarter = (dateString: string) => {
  if (!dateString) return "Next Quarter";
  const date = new Date(dateString);
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();
  
  if (month <= 2) return `Q2 ${year}`;       // Jan-Mar -> Q2
  if (month <= 5) return `Q3 ${year}`;       // Apr-Jun -> Q3
  if (month <= 8) return `Q4 ${year}`;       // Jul-Sep -> Q4
  return `Q1 ${year + 1}`;                   // Oct-Dec -> Q1 next year
};

export default function App() {
  const [step, setStep] = useState(1);
  
  // --- Step 1 Form State ---
  const [accountId, setAccountId] = useLocalStorage('pof_accountId', '');
  const [poolTotal, setPoolTotal] = useLocalStorage<number | ''>('pof_poolTotal', ''); 
  const [freeCredits, setFreeCredits] = useLocalStorage<number | ''>('pof_freeCredits', ''); 
  const [contractMonths, setContractMonths] = useLocalStorage<number | ''>('pof_contractMonths', '');
  const [startDate, setStartDate] = useLocalStorage('pof_startDate', '');
  const [closeDate, setCloseDate] = useLocalStorage('pof_closeDate', '');
  
  // --- Step 2 Form State ---
  const [quota, setQuota] = useLocalStorage<number | ''>('pof_quota', '');
  const [variableComp, setVariableComp] = useLocalStorage<number | ''>('pof_variableComp', '');
  const [splitPercent, setSplitPercent] = useLocalStorage<number | ''>('pof_splitPercent', 100);
  const [accelerationMultiplier, setAccelerationMultiplier] = useLocalStorage<number | ''>('pof_accelMult', 0);

  // --- Results & Loading State ---
  const [isCalculated, setIsCalculated] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [baselineData, setBaselineData] = useState<any>(null);
  const [results, setResults] = useState({
    tcvExcludingCredits: 0,
    annualizedTcv: 0,
    reportingAcv: 0
  });
  const [isCalculatedStep2, setIsCalculatedStep2] = useState(false);

  // --- Utility for Formatting Currency Inputs ---
  const displayAsCurrency = (val: number | '') => {
    if (val === '') return '';
    return val.toLocaleString('en-US');
  };

  const handleCurrencyInput = (val: string, setter: (val: number | '') => void, resetters: (() => void)[]) => {
    const rawNum = val.replace(/[^0-9]/g, '');
    setter(rawNum === '' ? '' : Number(rawNum));
    resetters.forEach(r => r());
  };

  // --- Mock Backend Function ---
  const fetchBaselineFromBackend = async (acctId: string) => {
    return new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve({
          priorStartDate: '12/29/2025',
          actualizedEndDate: '1/31/2026',
          realizedTerm: 1,
          commitBaseline: 197969,
          variableBaseline: 368154,
          totalBaseline: 566123
        }); 
      }, 1200);
    });
  };

  const handleConfirmStep1 = async () => {
    if (!accountId || poolTotal === '' || contractMonths === '' || !startDate || !closeDate) {
      alert("Please fill in all required fields. (Free Credits is optional)");
      return;
    }

    const startYear = new Date(startDate).getFullYear();
    const closeYear = new Date(closeDate).getFullYear();
    
    if (accountId.length !== 18) {
      alert("SFDC Account ID must be exactly 18 characters.");
      return;
    }
    if (startYear < 2000 || startYear > 2099 || closeYear < 2000 || closeYear > 2099) {
      alert("Please enter a valid 4-digit year for the dates.");
      return;
    }
    if (Number(contractMonths) <= 0) {
      alert("Contract Months must be greater than 0.");
      return;
    }

    setIsCalculating(true);
    setIsCalculated(false);
    setIsCalculatedStep2(false); 

    const fetchedData = await fetchBaselineFromBackend(accountId);
    setBaselineData(fetchedData);

    const tcv = Number(poolTotal);
    const credits = Number(freeCredits) || 0; 
    const months = Number(contractMonths);

    const tcvExcludingCredits = tcv - credits;
    const annualizedTcv = months > 0 ? (tcvExcludingCredits / months) * 12 : 0;
    const reportingAcv = annualizedTcv - fetchedData.totalBaseline;

    setResults({
      tcvExcludingCredits,
      annualizedTcv,
      reportingAcv
    });
    
    setIsCalculating(false);
    setIsCalculated(true);
  };

  const handleConfirmStep2 = () => {
    if (quota === '' || variableComp === '' || splitPercent === '' || accelerationMultiplier === '') {
      alert("Please fill in all Step 2 fields (enter 0 if a multiplier does not apply).");
      return;
    }
    if (Number(quota) <= 0) {
      alert("Annual Quota must be greater than 0 to calculate attainment.");
      return;
    }
    setIsCalculatedStep2(true);
  };

  const clearForm = () => {
    if(window.confirm("Are you sure you want to clear all inputs?")) {
      setAccountId('');
      setPoolTotal('');
      setFreeCredits('');
      setContractMonths('');
      setStartDate('');
      setCloseDate('');
      setQuota('');
      setVariableComp('');
      setSplitPercent(100);
      setAccelerationMultiplier(0);
      setIsCalculated(false);
      setIsCalculatedStep2(false);
      setStep(1);
    }
  };

  // --- Step 2 & 3 Calculations ---
  const activeSplit = Number(splitPercent) || 0;
  const activeQuota = Number(quota) || 0;
  const activeVarComp = Number(variableComp) || 0;
  const activeAccel = Number(accelerationMultiplier) || 0;

  const salesCredits = results.reportingAcv * (activeSplit / 100);
  const attainment = activeQuota > 0 ? (salesCredits / activeQuota) : 0;
  const basePayout = attainment * activeVarComp;
  const commissionPayout = basePayout * (1 + (activeAccel / 100));

  // Visual helper for the perfectly centered dollar sign
  const dollarSignStyle: React.CSSProperties = {
    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', 
    color: '#6b7280', pointerEvents: 'none', fontSize: '0.95rem'
  };

  const currencyInputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 10px 10px 26px', borderRadius: '6px', 
    border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem'
  };

  return (
    <div style={{ maxWidth: '750px', margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '30px', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
      
      {/* ==========================================
          STEP 1: ASSESS DEAL ACV
          ========================================== */}
      {step === 1 && (
        <>
          <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '16px', marginBottom: '24px', borderRadius: '4px', fontSize: '0.85rem', lineHeight: '1.5', color: '#92400e' }}>
            <strong>Important Notice:</strong> The estimated ACV for POF-related opportunities is directional. It may be inaccurate for accounts with gaps in contracts, require manual overrides, has incorrect SFDC data, or has delay in SFDC data update, involve account merger/split etc. <strong>Please consider SFDC the final source of truth for any discrepancies for reporting ACV.</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f3f4f6', paddingBottom: '16px', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, color: '#111827' }}>Step 1: Assess Deal ACV</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={clearForm} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', textDecoration: 'underline' }}>Clear Draft</button>
              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 12px', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 'bold' }}>Step 1 of 3</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>SFDC Account ID (18 char) *</label>
              <input type="text" maxLength={18} placeholder="e.g. 00130000000ABCD123" value={accountId} onChange={(e) => { setAccountId(e.target.value.replace(/[^a-zA-Z0-9]/g, '')); setIsCalculated(false); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Pool Total (TCV) *</label>
                <div style={{ position: 'relative' }}>
                  <span style={dollarSignStyle}>$</span>
                  <input type="text" placeholder="e.g. 1,000,000" value={displayAsCurrency(poolTotal)} onChange={(e) => handleCurrencyInput(e.target.value, setPoolTotal, [() => setIsCalculated(false), () => setIsCalculatedStep2(false)])} style={currencyInputStyle} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Free Credits (Optional)</label>
                <div style={{ position: 'relative' }}>
                  <span style={dollarSignStyle}>$</span>
                  <input type="text" placeholder="0" value={displayAsCurrency(freeCredits)} onChange={(e) => handleCurrencyInput(e.target.value, setFreeCredits, [() => setIsCalculated(false), () => setIsCalculatedStep2(false)])} style={currencyInputStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Expected Contract Start Date *</label>
                <input type="date" min="2000-01-01" max="2099-12-31" value={startDate} onChange={(e) => { setStartDate(e.target.value); setIsCalculated(false); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Expected Contract Close Date *</label>
                <input type="date" min="2000-01-01" max="2099-12-31" value={closeDate} onChange={(e) => { setCloseDate(e.target.value); setIsCalculated(false); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Contract Months *</label>
              <input type="number" min="1" max="120" value={contractMonths} onChange={(e) => { setContractMonths(e.target.value === '' ? '' : Number(e.target.value)); setIsCalculated(false); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
            </div>
          </div>

          <button 
            onClick={handleConfirmStep1}
            disabled={isCalculating}
            style={{ width: '100%', marginTop: '30px', padding: '14px', background: isCalculating ? '#4b5563' : '#111827', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: isCalculating ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
          >
            {isCalculating ? 'Fetching Baseline & Calculating...' : 'Confirm Inputs & Calculate'}
          </button>

          {isCalculated && baselineData && (
            <div style={{ marginTop: '30px', borderTop: '2px dashed #e5e7eb', paddingTop: '24px' }}>
              <h3 style={{ marginTop: 0, color: '#374151' }}>System Calculation Breakdown</h3>
              
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '4px', border: '1px solid #d1d5db', marginBottom: '20px', fontSize: '0.95rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>Base MRR: Prior contract start date</span><span>{baselineData.priorStartDate}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>Base MRR: Actualized end date</span><span>{baselineData.actualizedEndDate}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><span>Realized Term (# of months)</span><span>{baselineData.realizedTerm}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>Commit baseline</span><span>${baselineData.commitBaseline.toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>+ Variable baseline</span><span>${baselineData.variableBaseline.toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}><span>= Total baseline</span><span>${baselineData.totalBaseline.toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>= Final: total baseline</span><span>${baselineData.totalBaseline.toLocaleString()}</span></div>
              </div>

              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '4px', border: '1px solid #d1d5db', marginBottom: '24px', fontSize: '0.95rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>TCV (excluding credits)</span><span>${results.tcvExcludingCredits.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>/ Contract Month</span><span>{contractMonths}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>= Annualized TCV</span><span>${results.annualizedTcv.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#374151' }}><span>- Total Baseline</span><span>${baselineData.totalBaseline.toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}><span>= Reporting ACV Estimate</span><span>${results.reportingAcv.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span></div>
              </div>

              <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '8px', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '1rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reporting ACV Estimates</div>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f172a', margin: '8px 0' }}>${results.reportingAcv.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>* Highly directional estimate based on computed baseline from prior contract</div>
              </div>

              <button 
                onClick={() => setStep(2)}
                style={{ width: '100%', marginTop: '24px', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Proceed to Step 2 ➔
              </button>
            </div>
          )}
        </>
      )}

      {/* ==========================================
          STEP 2: ESTIMATE PAYOUT
          ========================================== */}
      {step === 2 && (
        <>
          <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '16px', marginBottom: '24px', borderRadius: '4px', fontSize: '0.85rem', lineHeight: '1.5', color: '#0369a1' }}>
            <strong>Important Notice:</strong> Commission payout is highly directional. Please consider <strong>Varicent</strong> the final source of truth for any discrepancies regarding sales credits and commission.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f3f4f6', paddingBottom: '16px', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, color: '#111827' }}>Step 2: Estimate Payout</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={() => setStep(1)} style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'underline' }}>⬅ Back to Step 1</button>
              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 12px', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 'bold' }}>Step 2 of 3</span>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#475569', fontWeight: '500' }}>Reporting ACV Estimate (from Step 1)</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>${results.reportingAcv.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Annual Quota ($) *</label>
                <div style={{ position: 'relative' }}>
                  <span style={dollarSignStyle}>$</span>
                  <input type="text" placeholder="e.g. 1,000,000" value={displayAsCurrency(quota)} onChange={(e) => handleCurrencyInput(e.target.value, setQuota, [() => setIsCalculatedStep2(false)])} style={currencyInputStyle} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>On-Target Variable Comp ($) *</label>
                <div style={{ position: 'relative' }}>
                  <span style={dollarSignStyle}>$</span>
                  <input type="text" placeholder="e.g. 150,000" value={displayAsCurrency(variableComp)} onChange={(e) => handleCurrencyInput(e.target.value, setVariableComp, [() => setIsCalculatedStep2(false)])} style={currencyInputStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>% Split from this POF Deal *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="number" min="0" max="100" placeholder="100" value={splitPercent} onChange={(e) => { setSplitPercent(e.target.value === '' ? '' : Number(e.target.value)); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
                  <span style={{ fontWeight: 'bold', color: '#4b5563' }}>%</span>
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>Acceleration Multiplier (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="number" placeholder="0" value={accelerationMultiplier} onChange={(e) => { setAccelerationMultiplier(e.target.value === '' ? '' : Number(e.target.value)); setIsCalculatedStep2(false); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.95rem' }} />
                  <span style={{ fontWeight: 'bold', color: '#4b5563' }}>%</span>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleConfirmStep2}
            style={{ width: '100%', padding: '14px', background: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', marginBottom: '24px' }}
          >
            Confirm Inputs & Calculate Payout
          </button>

          {isCalculatedStep2 && (
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '24px' }}>
               <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#1f2937', fontSize: '1.1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>Payout Estimate Breakdown</h3>
               
               <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ color: '#4b5563', fontWeight: '600' }}>Sales Credits</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#0f172a' }}>${salesCredits.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>= reporting acv estimate * % of split</div>
               </div>

               <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ color: '#4b5563', fontWeight: '600' }}>Attainment</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#047857' }}>{(attainment * 100).toFixed(2)}%</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>= sales credits / annual quota</div>
               </div>

               <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginTop: '24px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1.1rem' }}>Commission Payout Estimate</div>
                    <div style={{ fontWeight: 'bold', fontSize: '2rem', color: '#2563eb' }}>${commissionPayout.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                    = (attainment * on-target variable comp) * (1 + acceleration multiplier %)
                  </div>
               </div>
            </div>
          )}

          {isCalculatedStep2 && (
            <button 
              onClick={() => setStep(3)}
              style={{ width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Proceed to Step 3 ➔
            </button>
          )}
        </>
      )}

      {/* ==========================================
          STEP 3: ESTIMATE PAYMENT SCHEDULE
          ========================================== */}
      {step === 3 && (
        <>
          <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '16px', marginBottom: '24px', borderRadius: '4px', fontSize: '0.85rem', lineHeight: '1.5', color: '#166534' }}>
            <strong>Important Notice:</strong> Commission payment estimate is highly directional. Please consider <strong>Varicent</strong> the final source of truth for any discrepancies regarding commission payment.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f3f4f6', paddingBottom: '16px', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, color: '#111827' }}>Step 3: Estimate Payment Schedule</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={() => setStep(2)} style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'underline' }}>⬅ Back to Step 2</button>
              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 12px', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 'bold' }}>Step 3 of 3</span>
            </div>
          </div>

          {/* Read-Only Context from Step 2 */}
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#475569', fontWeight: '500' }}>Total Commission Payout Estimate</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>${commissionPayout.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
          </div>

          {/* Payment Schedule Table */}
          <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #d1d5db', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                <tr>
                  <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563', fontWeight: '600' }}>Installment</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563', fontWeight: '600' }}>Expected Timing</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563', fontWeight: '600' }}>% Release</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563', fontWeight: '600' }}>Payment Estimate</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563', fontWeight: '600' }}>Condition</th>
                </tr>
              </thead>
              <tbody>
                {/* Installment 1 */}
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#111827' }}>#1 (Initial)</td>
                  <td style={{ padding: '16px', fontSize: '0.9rem', color: '#374151' }}>{getNextQuarter(closeDate)}</td>
                  <td style={{ padding: '16px', fontSize: '0.9rem', color: '#374151' }}>50%</td>
                  <td style={{ padding: '16px', fontSize: '1rem', fontWeight: 'bold', color: '#047857' }}>${(commissionPayout * 0.5).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '16px', fontSize: '0.85rem', color: '#6b7280' }}>Upon Contract Signature</td>
                </tr>
                {/* Installment 2 (Dummy) */}
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#111827' }}>#2 (True-up)</td>
                  <td style={{ padding: '16px', fontSize: '0.9rem', color: '#374151' }}>TBD</td>
                  <td style={{ padding: '16px', fontSize: '0.9rem', color: '#374151' }}>50%</td>
                  <td style={{ padding: '16px', fontSize: '1rem', fontWeight: 'bold', color: '#047857' }}>${(commissionPayout * 0.5).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '16px', fontSize: '0.85rem', color: '#6b7280' }}>When monthly total POF billing exceeds run rate</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  )
}