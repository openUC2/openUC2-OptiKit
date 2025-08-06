// Simple CSV parser to replace Papa.parse
window.Papa = {
  parse: function(text, options) {
    const lines = text.split('\n');
    const data = lines.map(line => {
      // Simple CSV parsing - handle semicolon-separated values
      return line.split(';');
    });
    return { data: data };
  }
};