/**
 * Parses a Turkish locale number string into a float.
 * @param {string|number} value - e.g. "1.350,83" or "1350.83"
 * @returns {number|null}
 */
export const parseTrNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  
  // Replace all dots (thousand separators in TR) with nothing
  let cleanValue = value.replace(/\./g, '');
  // Replace comma (decimal separator in TR) with dot
  cleanValue = cleanValue.replace(/,/g, '.');
  
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Formats a float into a Turkish locale number string.
 * @param {number|string} value 
 * @param {number} decimals 
 * @returns {string}
 */
export const formatTrNumber = (value, decimals = 2) => {
  if (value === undefined || value === null || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  
  return num.toLocaleString('tr-TR', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};
