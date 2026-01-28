function resolvePdfTable(service) {
  switch (service) {
    case 'roofing':
      return 'pdf_conversions_roofing';
    case 'solar':
      return 'pdf_conversions_solar';
    case 'window':
    default:
      return 'pdf_conversions_window';
  }
}

module.exports = { resolvePdfTable };
