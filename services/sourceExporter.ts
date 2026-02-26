
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const FILES_TO_EXPORT = [
  'App.tsx',
  'types.ts',
  'constants.tsx',
  'index.html',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'metadata.json',
  'components/Dashboard.tsx',
  'components/AccountRegistration.tsx',
  'components/GeneralRegistry.tsx',
  'components/FinancialPostings.tsx',
  'components/PostingsList.tsx',
  'components/DRE.tsx',
  'components/Auth.tsx',
  'components/FinancialAnalysis.tsx',
  'services/geminiService.ts'
];

export const exportProjectSource = async () => {
  const zip = new JSZip();
  
  const fetchPromises = FILES_TO_EXPORT.map(async (path) => {
    try {
      const response = await fetch(`/${path}`);
      if (response.ok) {
        const content = await response.text();
        zip.file(path, content);
      }
    } catch (err) {
      console.error(`Erro ao baixar ${path}:`, err);
    }
  });

  await Promise.all(fetchPromises);
  
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'profit_food_source_code.zip');
};
