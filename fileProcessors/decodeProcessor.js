// Reverse only token-bearing text. Existing parsers and OOXML safeguards do the work.
(() => {
  'use strict';
  const processors=[IDIATextProcessor,IDIADocxProcessor,IDIAXlsxProcessor];
  function name(file){return file.name.replace(/(\.(?:txt|csv|docx|xlsx))$/i,'-decoded$1');}
  function summary(result){
    const d=result.diagnostics;
    if(result.known)return `${result.known} protected ${result.known===1?'value can':'values can'} be restored`+
      (result.unknown?` · ${result.unknown} unknown IDIA ${result.unknown===1?'token':'tokens'}`:'')+
      (d.scopeMismatches?` · ${d.scopeMismatches} belong to a different protected session/conversation`:'');
    if(!d.idiaLikeTokens)return 'No IDIA tokens found in this file.';
    if(!d.exactTokens)return `${d.idiaLikeTokens} IDIA-like tokens found, but none has the exact IDIA token format. No values can be restored.`;
    if(d.sessionMatches===null)return 'IDIA tokens were found, but no mapping matches the current conversation. Global Session Vault diagnostics are unavailable in the running version; missing and other-conversation mappings cannot yet be distinguished.';
    if(d.scopeMismatches)return `IDIA tokens were found, but they belong to a different protected session/conversation. ${d.scopeMismatches} scope mismatches; ${d.unmapped} exact tokens have no mapping. Conversation isolation was preserved.`;
    return `${d.exactTokens} IDIA tokens found, but their mappings are not available in the current Session Vault. This can happen after IDIA/Chrome is reloaded.`;
  }
  function diagnosticLines(d){
    const lines=[];
    if(d.xlsx)lines.push(`XLSX opened: ${d.xlsxOpened}`,`sharedStrings.xml present: ${d.sharedStringsPresent===null?'not inspected':d.sharedStringsPresent}`,
      `shared-string text entries scanned: ${d.sharedEntriesScanned}`,`inline-string entries scanned: ${d.inlineEntriesScanned}`,`other string-cell entries scanned: ${d.otherStringEntriesScanned}`);
    lines.push(`Scan complete: ${d.scanComplete}`,`IDIA-like tokens found in file: ${d.idiaLikeTokens}`,`exact syntactically valid IDIA tokens: ${d.exactTokens}`,
      `vault entries found globally in current session: ${d.sessionMatches??'unavailable'}`,`conversation-scope matches: ${d.scopeMatches??'unavailable'}`,
      `different-scope tokens: ${d.scopeMismatches??'unavailable'}`,`unknown/unmapped tokens: ${d.unmapped===null?'unavailable':d.unmapped+d.idiaLikeTokens-d.exactTokens}`,`unrecognized token syntax: ${d.idiaLikeTokens-d.exactTokens}`);
    for(const t of d.tokenStatus||[])lines.push(`${t.token} | session: ${t.inSession} | current scope: ${t.inScope}`);
    for(const source of d.tokenSources||[])lines.push(`${source.token} | ${source.sourceKind} | ${source.sourcePart} | entry ${source.entryIndex}${source.formulaCache?' | formula cache':''}`);
    return lines.join('\n');
  }
  async function prepare(file,{signal,check,lookup}){
    const checkAbort=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
    checkAbort();
    const processor=processors.find(p=>p.supports(file));if(!processor)throw new Error('Decode supports TXT, CSV, DOCX and XLSX only. PDF and images are irreversible.');
    const diagnostics={xlsx:/\.xlsx$/i.test(file.name),xlsxOpened:false,sharedStringsPresent:null,sharedEntriesScanned:0,inlineEntriesScanned:0,otherStringEntriesScanned:0,
      scanComplete:false,idiaLikeTokens:0,exactTokens:0,sessionMatches:null,scopeMatches:null,scopeMismatches:null,unmapped:null,unknown:null,tokenStatus:[],tokenSources:[]};
    const tokenLike=new Set(),exact=new Set();
    try{
      const contents=await processor.prepare(file,{signal,decodeTokens:true,diagnostics,scanText:(text,source)=>{
        for(const token of IDIATokenSyntax.likeTokens(text)){
          tokenLike.add(token);if(tokenLike.size>2000)throw new Error('This file contains too many IDIA tokens (limit 2000 distinct tokens).');
          if(source){if(diagnostics.tokenSources.length>=10000)throw new Error('Too many token locations for a safe diagnostic scan.');diagnostics.tokenSources.push({token,...source});}
        }
        const findings=IDIATokenSyntax.find(text);for(const f of findings)exact.add(f.value);
        diagnostics.idiaLikeTokens=tokenLike.size;diagnostics.exactTokens=exact.size;
        return findings;
      },transform:async selected=>{
        checkAbort();const mappings=await lookup([...new Set(selected.map(f=>f.value))]);checkAbort();
        return selected.map(f=>{if(!Object.hasOwn(mappings,f.value))throw new Error('The session vault changed. Reopen and scan the protected file again.');return {...f,replacement:mappings[f.value]};});
      }});
      checkAbort();diagnostics.scanComplete=true;
      const candidates=[...exact],report=await check(candidates);checkAbort();
      // Older active workers may lack diagnostics. Do not call that "lost mappings".
      const known=Array.isArray(report)?report:report.tokens;
      if(!Array.isArray(known)||known.some(t=>!exact.has(t)))throw new Error('Invalid local token check.');
      diagnostics.scopeMatches=new Set(known).size;
      diagnostics.unknown=[...tokenLike].filter(t=>!known.includes(t)).length;
      if(!Array.isArray(report)&&Array.isArray(report.tokenStatus)){
        diagnostics.sessionMatches=report.sessionMatches;diagnostics.scopeMismatches=report.scopeMismatches;diagnostics.unmapped=report.unmapped;diagnostics.tokenStatus=report.tokenStatus;
      }
      const findings=contents.findings.filter(f=>known.includes(f.value));
      return {findings,known:diagnostics.scopeMatches,unknown:diagnostics.unknown,diagnostics,
        async build(){checkAbort();if(!findings.length)throw new Error('No exact known tokens for this conversation.');const result=await contents.buildFile(findings,name(file));checkAbort();return result;}};
    }catch(error){if(error.name!=='AbortError')error.decodeDiagnostics=diagnostics;throw error;}
  }
  globalThis.IDIADecodeProcessor=Object.freeze({prepare,name,summary,diagnosticLines});
})();
