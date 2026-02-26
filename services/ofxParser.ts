
export type ParsedTxn = {
  postedDate: string; // YYYY-MM-DD
  amount: number;
  memo: string;
  fitId?: string;
  checkNumber?: string;
  raw?: any;
};

export type ParsedOfx = {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
  transactions: ParsedTxn[];
};

export const parseOFX = (text: string): ParsedOfx => {
  // Normalize line endings and encoding if necessary
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Detect if it's XML or SGML
  // Force SGML if headers indicate it
  const isSgml = normalizedText.includes('OFXHEADER:') || normalizedText.includes('DATA:OFXSGML');
  const isXml = !isSgml && (normalizedText.includes('<?xml') || (normalizedText.includes('<OFX>') && normalizedText.includes('</OFX>')));

  if (isXml) {
    return parseXmlOfx(normalizedText);
  } else {
    return parseSgmlOfx(normalizedText);
  }
};

const parseDate = (ofxDate: string): string => {
  if (!ofxDate) return '';
  // Format: YYYYMMDDHHMMSS or YYYYMMDD
  const datePart = ofxDate.substring(0, 8);
  if (datePart.length !== 8) return '';
  
  const year = datePart.substring(0, 4);
  const month = datePart.substring(4, 6);
  const day = datePart.substring(6, 8);
  
  return `${year}-${month}-${day}`;
};

const parseAmount = (amountStr: string): number => {
  if (!amountStr) return 0;
  // Replace comma with dot if necessary, though OFX usually uses dot
  return parseFloat(amountStr.replace(',', '.'));
};

const parseSgmlOfx = (text: string): ParsedOfx => {
  const transactions: ParsedTxn[] = [];
  
  // Extract blocks using the requested regex
  // We use the requested regex but also a fallback for SGML without closing tags
  let blocks = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];
  
  if (blocks.length === 0) {
    // Fallback for SGML without closing tags
    blocks = text.match(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/OFX>|$)/gi) ?? [];
  }

  console.log("OFX: blocks.length =", blocks.length);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    
    const getTagValue = (tagName: string) => {
      // Regex tolerant for tags without closing tags
      const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
      const match = block.match(regex);
      return match ? match[1].trim() : '';
    };

    const postedDateRaw = getTagValue('DTPOSTED');
    const amountRaw = getTagValue('TRNAMT');
    const memo = getTagValue('MEMO') || getTagValue('NAME') || '';
    const fitId = getTagValue('FITID');
    const checkNumber = getTagValue('CHECKNUM');

    const postedDate = parseDate(postedDateRaw);
    const amount = parseAmount(amountRaw);

    if (!postedDate || isNaN(amount) || amountRaw === '') {
      continue;
    }

    transactions.push({
      postedDate,
      amount,
      memo,
      fitId: fitId || `${postedDate}|${amount}|${memo}`,
      checkNumber,
      raw: { block }
    });
  }

  if (blocks.length > 0 && transactions.length === 0) {
    const firstBlock = blocks[0];
    console.log("OFX: first block sample (120 chars)", firstBlock.substring(0, 120).replace(/\n/g, ' '));
    
    const getTagValue = (tagName: string) => {
      const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
      const match = firstBlock.match(regex);
      return match ? match[1].trim() : '';
    };
    const dt = getTagValue('DTPOSTED');
    const amt = getTagValue('TRNAMT');
    console.log(`OFX: discard reason - DTPOSTED: "${dt}" (parsed: "${parseDate(dt)}"), TRNAMT: "${amt}" (parsed: ${parseAmount(amt)})`);
  }

  // Extract from/to dates
  const getGlobalTagValue = (tagName: string) => {
    const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  console.log("OFX: parsed", transactions.length);

  return {
    fromDate: parseDate(getGlobalTagValue('DTSTART')),
    toDate: parseDate(getGlobalTagValue('DTEND')),
    transactions
  };
};

const parseXmlOfx = (text: string): ParsedOfx => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  const transactions: ParsedTxn[] = [];
  const stmtTrns = xmlDoc.getElementsByTagName("STMTTRN");
  
  for (let i = 0; i < stmtTrns.length; i++) {
    const trn = stmtTrns[i];
    const getVal = (tag: string) => trn.getElementsByTagName(tag)[0]?.textContent || '';
    
    const postedDateRaw = getVal("DTPOSTED");
    const amountRaw = getVal("TRNAMT");
    const memo = getVal("MEMO") || getVal("NAME") || '';
    const fitId = getVal("FITID");
    const checkNumber = getVal("CHECKNUM");

    const postedDate = parseDate(postedDateRaw);
    const amount = parseAmount(amountRaw);

    if (postedDate) {
      transactions.push({
        postedDate,
        amount,
        memo,
        fitId: fitId || `${postedDate}|${amount}|${memo}`,
        checkNumber,
        raw: { xml: trn.outerHTML }
      });
    }
  }

  const dtStart = xmlDoc.getElementsByTagName("DTSTART")[0]?.textContent || '';
  const dtEnd = xmlDoc.getElementsByTagName("DTEND")[0]?.textContent || '';

  return {
    fromDate: parseDate(dtStart),
    toDate: parseDate(dtEnd),
    transactions
  };
};
