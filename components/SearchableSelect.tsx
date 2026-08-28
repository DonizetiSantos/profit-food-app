import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  id: string;
  name: string;
}

interface Props {
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  emptyMessage?: string;
}

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Campo de seleção com busca (autocomplete). Visualmente compatível com os
 * <select> escuros do app, mas permite digitar para filtrar em vez de rolar
 * uma lista longa. Value/onChange funcionam como um <select> normal (id da
 * opção selecionada).
 */
export const SearchableSelect: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  required = false,
  className = '',
  emptyMessage = 'Nenhum resultado encontrado.',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value) || null,
    [options, value]
  );

  // Mantém o texto exibido sincronizado com o valor selecionado quando o
  // dropdown está fechado (ex.: reset de formulário, edição de lançamento).
  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedOption?.name || '');
    }
  }, [selectedOption, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedOption?.name || '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!isOpen || !normalizedQuery || normalizedQuery === normalizeText(selectedOption?.name || '')) {
      return sorted;
    }
    return sorted.filter((opt) => normalizeText(opt.name).includes(normalizedQuery));
  }, [options, query, isOpen, selectedOption]);

  const handleSelect = (option: SearchableSelectOption) => {
    onChange(option.id);
    setQuery(option.name);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filteredOptions[highlightedIndex];
      if (option) handleSelect(option);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery(selectedOption?.name || '');
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="form-input-dark w-full pr-9 disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Limpar seleção"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
        )}
      </div>

      {isOpen && !disabled && (
        <ul className="absolute z-50 mt-2 w-full max-h-60 overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1 custom-scrollbar">
          {filteredOptions.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate-500 font-medium">{emptyMessage}</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(option);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                  index === highlightedIndex ? 'bg-slate-800 text-rose-500' : 'text-slate-200'
                } ${option.id === value ? 'font-black' : ''}`}
              >
                {option.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
