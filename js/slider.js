const slider = document.getElementById("day-slider");
const label = document.getElementById("day-label");

const start = new Date(2017, 0, 1);   // jan 1, 2017
const fmt = d3.timeFormat("%b %d");

function dateFromIndex(i) {
  const d = new Date(start);
  d.setDate(start.getDate() + i);
  return d;
}

function setDay(i) {
  const d = dateFromIndex(i);
  label.textContent = fmt(d);

  // makes the chosen date globally accessible
    window.selectedDate = d;

  // map redraw
  if (window.updateMapForDate) window.updateMapForDate(d);

  // linechart redraw
  if (window.updateChartFromSlider) window.updateChartFromSlider(d);
}

// init
window.addEventListener("load", () => {
    setDay(+slider.value);
}); 

// live update while dragging
slider.addEventListener("change", (e) => setDay(+e.target.value));