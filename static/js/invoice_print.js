// static/js/invoice_print.js
function openInvoicePrint(htmlContent){
  const w = window.open('', '_blank', 'width=900,height=1200');
  if(!w) { alert('Popup blocked — allow popups to print invoice'); return; }
  w.document.write(htmlContent);
  w.document.close();
  w.focus();
  // Wait until content loaded then print
  w.onload = function(){
    setTimeout(()=>{ w.print(); }, 500);
  };
}
