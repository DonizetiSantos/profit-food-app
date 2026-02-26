
import { XmlItem } from '../types';

export interface NfeData {
  supplierName: string;
  supplierCnpj: string;
  issueDate: string;
  nfeNumber: string;
  nfeKey: string;
  totalValue: number;
  items: XmlItem[];
}

export const parseNfeXml = (xmlString: string): NfeData => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const getTagValue = (parent: Element | Document, tagName: string) => {
    return parent.getElementsByTagName(tagName)[0]?.textContent || '';
  };

  // Emitente (Fornecedor)
  const emit = xmlDoc.getElementsByTagName("emit")[0];
  const supplierName = getTagValue(emit, "xNome");
  const supplierCnpj = getTagValue(emit, "CNPJ") || getTagValue(emit, "CPF");

  // Dados da NF-e
  const ide = xmlDoc.getElementsByTagName("ide")[0];
  const issueDate = getTagValue(ide, "dhEmi").split('T')[0] || getTagValue(ide, "dEmi");
  const nfeNumber = getTagValue(ide, "nNF");
  
  const infNFe = xmlDoc.getElementsByTagName("infNFe")[0];
  const nfeKey = infNFe?.getAttribute("Id")?.replace('NFe', '') || '';

  // Totais
  const total = xmlDoc.getElementsByTagName("total")[0];
  const totalValue = parseFloat(getTagValue(total, "vNF") || "0");

  // Itens
  const detElements = xmlDoc.getElementsByTagName("det");
  const items: XmlItem[] = [];

  for (let i = 0; i < detElements.length; i++) {
    const det = detElements[i];
    const prod = det.getElementsByTagName("prod")[0];
    
    items.push({
      cProd: getTagValue(prod, "cProd"),
      xProd: getTagValue(prod, "xProd"),
      vProd: parseFloat(getTagValue(prod, "vProd") || "0"),
      qCom: parseFloat(getTagValue(prod, "qCom") || "0"),
      uCom: getTagValue(prod, "uCom"),
      vUnCom: parseFloat(getTagValue(prod, "vUnCom") || "0"),
      gtin: getTagValue(prod, "cEAN") !== 'SEM GTIN' ? getTagValue(prod, "cEAN") : ''
    });
  }

  return {
    supplierName,
    supplierCnpj,
    issueDate,
    nfeNumber,
    nfeKey,
    totalValue,
    items
  };
};

export const normalizeProductName = (name: string): string => {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/gi, '') // Remove pontuação
    .replace(/\s+/g, ' ') // Espaços múltiplos viram 1
    .trim();
};
