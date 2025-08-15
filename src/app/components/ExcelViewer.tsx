'use client';

import { useState, useEffect, useCallback } from 'react';
import { DataGrid, Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

interface ExcelCell {
  value: any;
  formula?: string | null;
  type?: string;
  format?: string | null;
  style?: any;
  html?: string | null;
  raw: string;
}

interface ExcelSheet {
  name: string;
  data: ExcelCell[][];
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  cols?: any[];
  rows?: any[];
}

interface ExcelData {
  sheets: ExcelSheet[];
  metadata: {
    sheetNames: string[];
    documentName: string;
  };
}

interface ExcelViewerProps {
  fileName: string;
}

interface CellPosition {
  row: number;
  col: number;
}

interface CellRange {
  start: CellPosition;
  end: CellPosition;
}

interface SheetSelection {
  selectedCell: CellPosition;
  selectedRange: CellRange | null;
}

interface CopiedData {
  range: CellRange;
  sheetIndex: number;
  data: string[][];
}

export default function ExcelViewer({ fileName }: ExcelViewerProps) {
  const [data, setData] = useState<ExcelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetSelections, setSheetSelections] = useState<Map<number, SheetSelection>>(new Map());
  const [isSelecting, setIsSelecting] = useState(false);
  const [formulaValue, setFormulaValue] = useState<string>('');
  const [isEditingFormula, setIsEditingFormula] = useState(false);
  const [copiedData, setCopiedData] = useState<CopiedData | null>(null);

  const fetchExcelData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/document/${encodeURIComponent(fileName)}/excel`);
      
      if (!response.ok) {
        throw new Error('Failed to load Excel document');
      }

      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Excel document');
    } finally {
      setLoading(false);
    }
  }, [fileName]);

  // Helper function to convert column index to Excel column letter
  const getColumnLetter = useCallback((index: number): string => {
    let result = '';
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }, []);

  // Helper function to get cell reference (e.g., "A1", "B5")
  const getCellReference = useCallback((row: number, col: number): string => {
    return `${getColumnLetter(col)}${row + 1}`;
  }, [getColumnLetter]);

  // Get current sheet selection
  const getCurrentSelection = useCallback((): SheetSelection => {
    return sheetSelections.get(activeSheet) || { 
      selectedCell: { row: 0, col: 0 }, 
      selectedRange: null 
    };
  }, [sheetSelections, activeSheet]);

  // Update current sheet selection
  const updateCurrentSelection = useCallback((update: Partial<SheetSelection>) => {
    const current = getCurrentSelection();
    const newSelection = { ...current, ...update };
    setSheetSelections(prev => new Map(prev).set(activeSheet, newSelection));
  }, [activeSheet, getCurrentSelection]);

  // Helper function to check if a cell is in the selected range
  const isCellInRange = useCallback((row: number, col: number): boolean => {
    const { selectedRange } = getCurrentSelection();
    if (!selectedRange) return false;
    const { start, end } = selectedRange;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  }, [getCurrentSelection]);

  // Helper function to check if a cell is in the copied range
  const isCellInCopiedRange = useCallback((row: number, col: number): boolean => {
    if (!copiedData || copiedData.sheetIndex !== activeSheet) return false;
    const { start, end } = copiedData.range;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  }, [copiedData, activeSheet]);

  // Helper function to get border styles for copied range
  const getCopiedCellBorderStyle = useCallback((row: number, col: number): React.CSSProperties => {
    if (!copiedData || copiedData.sheetIndex !== activeSheet) return {};
    
    const { start, end } = copiedData.range;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    if (row < minRow || row > maxRow || col < minCol || col > maxCol) return {};
    
    const isTopBorder = row === minRow;
    const isBottomBorder = row === maxRow;
    const isLeftBorder = col === minCol;
    const isRightBorder = col === maxCol;
    
    return {
      borderTop: isTopBorder ? '2px dashed #3b82f6' : undefined,
      borderBottom: isBottomBorder ? '2px dashed #3b82f6' : undefined,
      borderLeft: isLeftBorder ? '2px dashed #3b82f6' : undefined,
      borderRight: isRightBorder ? '2px dashed #3b82f6' : undefined,
    };
  }, [copiedData, activeSheet]);

  // Get current cell value
  const getCurrentCellValue = useCallback((): string => {
    if (!data || !data.sheets[activeSheet]) return '';
    const sheet = data.sheets[activeSheet];
    const { selectedCell } = getCurrentSelection();
    const cell = sheet.data[selectedCell.row]?.[selectedCell.col];
    return cell?.formula || cell?.raw || cell?.value || '';
  }, [data, activeSheet, getCurrentSelection]);

  // Copy functionality
  const handleCopy = useCallback(() => {
    if (!data || !data.sheets[activeSheet]) return;
    
    const { selectedRange, selectedCell } = getCurrentSelection();
    const sheet = data.sheets[activeSheet];
    
    // Determine the range to copy
    const range = selectedRange || { 
      start: selectedCell, 
      end: selectedCell 
    };
    
    const { start, end } = range;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    // Extract data from the range
    const copiedValues: string[][] = [];
    for (let row = minRow; row <= maxRow; row++) {
      const rowData: string[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const cell = sheet.data[row]?.[col];
        rowData.push(cell?.raw || cell?.value || '');
      }
      copiedValues.push(rowData);
    }
    
    // Store copied data
    setCopiedData({
      range,
      sheetIndex: activeSheet,
      data: copiedValues
    });
    
    // Also copy to clipboard for external paste
    const textData = copiedValues.map(row => row.join('\t')).join('\n');
    navigator.clipboard?.writeText(textData).catch(() => {
      // Fallback for browsers without clipboard API
      console.log('Clipboard API not available');
    });
  }, [data, activeSheet, getCurrentSelection]);

  // Cell selection handlers
  const handleCellClick = useCallback((row: number, col: number) => {
    updateCurrentSelection({
      selectedCell: { row, col },
      selectedRange: null
    });
    setIsSelecting(false);
  }, [updateCurrentSelection]);

  const handleCellMouseDown = useCallback((row: number, col: number) => {
    const newSelection = {
      selectedCell: { row, col },
      selectedRange: { start: { row, col }, end: { row, col } }
    };
    updateCurrentSelection(newSelection);
    setIsSelecting(true);
  }, [updateCurrentSelection]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (isSelecting) {
      const current = getCurrentSelection();
      if (current.selectedRange) {
        updateCurrentSelection({
          selectedRange: {
            ...current.selectedRange,
            end: { row, col }
          }
        });
      }
    }
  }, [isSelecting, getCurrentSelection, updateCurrentSelection]);

  const handleCellMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isEditingFormula || !data || !data.sheets[activeSheet]) return;

    // Handle copy/paste shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          handleCopy();
          return;
        case 'v':
          e.preventDefault();
          // Paste functionality would go here in a real implementation
          console.log('Paste not implemented in read-only viewer');
          return;
      }
    }

    const sheet = data.sheets[activeSheet];
    const maxRows = sheet.data.length;
    const maxCols = sheet.data[0]?.length || 0;
    const { selectedCell } = getCurrentSelection();
    let newRow = selectedCell.row;
    let newCol = selectedCell.col;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newRow = Math.max(0, selectedCell.row - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        newRow = Math.min(maxRows - 1, selectedCell.row + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newCol = Math.max(0, selectedCell.col - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newCol = Math.min(maxCols - 1, selectedCell.col + 1);
        break;
      case 'Enter':
        e.preventDefault();
        newRow = Math.min(maxRows - 1, selectedCell.row + 1);
        break;
      case 'Tab':
        e.preventDefault();
        newCol = Math.min(maxCols - 1, selectedCell.col + 1);
        break;
      case 'Escape':
        e.preventDefault();
        // Clear copied data
        setCopiedData(null);
        break;
    }

    if (newRow !== selectedCell.row || newCol !== selectedCell.col) {
      updateCurrentSelection({
        selectedCell: { row: newRow, col: newCol },
        selectedRange: null
      });
    }
  }, [isEditingFormula, data, activeSheet, getCurrentSelection, updateCurrentSelection, handleCopy]);

  useEffect(() => {
    fetchExcelData();
  }, [fetchExcelData]);

  // Update formula bar when selected cell changes
  useEffect(() => {
    if (!isEditingFormula) {
      setFormulaValue(getCurrentCellValue());
    }
  }, [sheetSelections, activeSheet, data, isEditingFormula, getCurrentCellValue]);

  // Global mouse up handler for drag selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
    };

    if (isSelecting) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isSelecting]);

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/document/${encodeURIComponent(fileName)}/content`);
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data?.metadata.documentName || 'document.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // You could add a toast notification here if you have one
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading spreadsheet...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-500">{error || 'Failed to load spreadsheet'}</div>
      </div>
    );
  }

  const currentSheet = data.sheets[activeSheet];

  // Convert sheet data to react-data-grid format
  const columns: Column<any>[] = [];
  const rows: any[] = [];

  if (currentSheet && currentSheet.data.length > 0) {
    // Generate column headers (A, B, C, etc.)
    // Use reduce instead of spread operator to avoid stack overflow with large datasets
    const maxCols = currentSheet.data.reduce((max, row) => Math.max(max, row.length), 0);
    
    // Add row number column
    columns.push({
      key: '__rowNum__',
      name: '',
      width: 50,
      frozen: true,
      cellClass: 'bg-gray-100 text-gray-600 text-center font-medium border-r-2 border-gray-300',
    });

    for (let i = 0; i < maxCols; i++) {
      const colLetter = getColumnLetter(i);
      columns.push({
        key: `col_${i}`,
        name: colLetter,
        width: 100,
        resizable: true,
        renderCell: ({ row, rowIdx }) => {
          const { selectedCell } = getCurrentSelection();
          const isSelected = selectedCell.row === rowIdx && selectedCell.col === i;
          const isInRange = isCellInRange(rowIdx, i);
          const isInCopiedRange = isCellInCopiedRange(rowIdx, i);
          const copiedBorderStyle = getCopiedCellBorderStyle(rowIdx, i);
          const cellValue = row[`col_${i}`] || '';
          
          return (
            <div
              className={`
                h-full w-full px-1 py-0.5 text-xs border-r border-b border-gray-200 
                cursor-cell select-none relative
                ${isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''}
                ${isInRange && !isSelected ? 'bg-blue-50' : ''}
                ${isInCopiedRange ? 'excel-copied-cell' : ''}
                hover:bg-gray-50
              `}
              onMouseDown={() => handleCellMouseDown(rowIdx, i)}
              onMouseEnter={() => handleCellMouseEnter(rowIdx, i)}
              onMouseUp={handleCellMouseUp}
              onTouchStart={() => handleCellClick(rowIdx, i)}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                ...copiedBorderStyle,
                ...(isInCopiedRange ? {
                  animation: 'excel-copy-border 1s infinite'
                } : {})
              }}
            >
              {cellValue}
            </div>
          );
        },
      });
    }

    // Convert data to rows
    currentSheet.data.forEach((row, rowIndex) => {
      const rowData: any = {
        __rowNum__: rowIndex + 1,
      };
      
      row.forEach((cell, colIndex) => {
        rowData[`col_${colIndex}`] = cell.raw || cell.value || '';
      });
      
      rows.push(rowData);
    });
  }

  return (
    <div className="w-full h-screen flex flex-col" style={{ backgroundColor: '#217346' }}>
      {/* Excel header with green theme */}
      <div className="bg-white shadow-sm">
        {/* Title bar */}
        <div className="px-2 sm:px-4 py-2 border-b border-gray-200 flex items-center justify-between" style={{ backgroundColor: '#217346' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg 
              className="text-white flex-shrink-0" 
              fill="currentColor" 
              viewBox="0 0 24 24"
              style={{ width: '16px', height: '16px' }}
            >
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M8,15.74L9.85,12.03L8.07,8.5H10.2L11.04,10.76C11.14,11.07 11.2,11.3 11.25,11.5H11.27C11.31,11.33 11.38,11.09 11.47,10.78L12.36,8.5H14.35L12.55,12L14.39,15.74H12.3L11.33,13.26C11.27,13.09 11.2,12.85 11.14,12.59H11.12C11.08,12.77 11,13 10.92,13.25L9.94,15.74H8Z"/>
            </svg>
            <span className="text-white font-medium text-sm truncate">{data.metadata.documentName}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 text-xs rounded transition-colors shadow-sm cursor-pointer"
              title="Download Excel file"
            >
              <svg 
                className="flex-shrink-0" 
                fill="currentColor" 
                viewBox="0 0 20 20"
                style={{ width: '14px', height: '14px' }}
              >
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </button>
            <div className="text-white text-xs opacity-80 hidden lg:block">
              Microsoft Excel Online Viewer
            </div>
          </div>
        </div>

        {/* Ribbon tabs */}
        <div className="bg-gray-50 px-2 py-1 border-b border-gray-300 flex gap-2 sm:gap-4">
          <span className="px-2 sm:px-3 py-1 text-xs font-medium text-gray-700 bg-white border-b-2 border-green-600">Home</span>
          <span className="px-2 sm:px-3 py-1 text-xs text-gray-500">Insert</span>
          <span className="px-2 sm:px-3 py-1 text-xs text-gray-500 hidden sm:inline">Page Layout</span>
          <span className="px-2 sm:px-3 py-1 text-xs text-gray-500 hidden md:inline">Formulas</span>
          <span className="px-2 sm:px-3 py-1 text-xs text-gray-500">Data</span>
        </div>

        {/* Formula bar */}
        <div className="bg-white px-2 py-1 border-b border-gray-300 flex items-center gap-1 sm:gap-2">
          <div className="px-2 sm:px-3 py-1 bg-gray-50 border border-gray-300 text-xs font-mono min-w-[40px] sm:min-w-[60px] text-center">
            {(() => {
              const { selectedCell } = getCurrentSelection();
              return getCellReference(selectedCell.row, selectedCell.col);
            })()}
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-gray-400 text-xs flex-shrink-0">fx</span>
            <input
              type="text"
              value={formulaValue}
              onChange={(e) => setFormulaValue(e.target.value)}
              onFocus={() => setIsEditingFormula(true)}
              onBlur={() => {
                setIsEditingFormula(false);
                // In a real implementation, you would save the formula here
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingFormula(false);
                  e.currentTarget.blur();
                  // In a real implementation, you would save the formula here
                } else if (e.key === 'Escape') {
                  setFormulaValue(getCurrentCellValue());
                  setIsEditingFormula(false);
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 px-2 py-1 bg-white border border-gray-300 text-xs font-mono min-w-0 focus:outline-none focus:border-blue-500"
              placeholder="Enter formula or value..."
            />
          </div>
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div 
        className="flex-1 overflow-hidden bg-white"
        onMouseLeave={() => setIsSelecting(false)}
      >
        <DataGrid
          columns={columns}
          rows={rows}
          className="rdg-light"
          style={{
            height: '100%',
            fontSize: '11px',
            fontFamily: 'Calibri, Segoe UI, Arial, sans-serif',
            backgroundColor: '#fff',
            outline: 'none',
          }}
          headerRowHeight={20}
          rowHeight={20}
          enableVirtualization={true}
        />
      </div>

      {/* Sheet tabs and status bar */}
      <div className="bg-white border-t border-gray-300">
        {/* Sheet tabs */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1">
            <div className="flex items-center px-2 border-r border-gray-300 flex-shrink-0">
              <button className="p-1 hover:bg-gray-100 rounded">
                <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-100 rounded">
                <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 min-w-0 flex-1">
              {data.sheets.map((sheet, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSheet(index)}
                  className={`px-3 sm:px-4 py-1 text-xs border-r border-gray-300 transition-colors whitespace-nowrap flex-shrink-0 ${
                    activeSheet === index
                      ? 'bg-white font-semibold text-gray-900 border-b-2 border-b-green-600'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                  style={activeSheet === index ? { borderBottomColor: '#217346' } : {}}
                >
                  {sheet.name}
                </button>
              ))}
              <button className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 flex-shrink-0">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Status bar */}
          <div className="px-2 sm:px-4 py-1 text-xs text-gray-600 flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <span className="hidden sm:inline">Ready</span>
            <span className="border-l border-gray-300 pl-2 sm:pl-4 text-xs">
              {currentSheet && `${currentSheet.data.length}×${currentSheet.data[0]?.length || 0}`}
            </span>
            <span className="border-l border-gray-300 pl-2 sm:pl-4 hidden sm:inline">100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
