// margin for space between ends and chart area
// top margin increased for title from 40 -> 60, we'll see if that was a good idea
const margin = { top: 60, right: 40, bottom: 40, left: 60 };
const width = 800 - margin.left - margin.right;
const height = 300 - margin.top - margin.bottom;

// global variables for the line chart
let weatherData = [];
let currentAveragedData = []; // to store calculated data
let selectedState = "MD";
let selectedFeature = "TAVG";
let isFirstLoad = true; // to prevent first load yaxis animation
let cursorDate = new Date(2017, 0, 1);
// let targetDate;

// scales, axes
let xScaleLine, yScaleLine;
let xAxisGroup, yAxisGroup;

// features and display mappings
const featureOptions = ["TMAX", "TMIN", "TAVG"];
const featureMappings = {
  TMAX: "Maximum Temperature (°F)",
  TMIN: "Minimum Temperature (°F)",
  TAVG: "Average Temperature (°F)",
};

// create svg
const lineChartSvg = d3
  .select("#linechart-vis")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

// create line of line chart with path
const path = lineChartSvg
  .append("path")
  .attr("fill", "none")
  .attr("stroke", "steelblue")
  .attr("stroke-width", 2);

function initLineChart() {
  // load csv data
  d3.csv("data/weather.csv")
    .then((data) => {
      // parser for properly reading in dates
      const parseDate = d3.timeParse("%Y%m%d");
      const cutoffDate = new Date(2017, 8, 20).getTime(); // data invalid at this point and after

      let validData = [];

      // ensure correct data types
      // note: if cell is empty set to null so
      // d3.mean et al. can ignore
      // -147.82  means inavlid temperature (-99.9 C)
      data.forEach((d) => {
        d.date = parseDate(d.date); // string -> Date

        if (d.date && d.date.getTime() < cutoffDate) {
          d.TMAX = d.TMAX === "" || +d.TMAX < -100 ? null : +d.TMAX;
          d.TMIN = d.TMIN === "" || +d.TMIN < -100 ? null : +d.TMIN;
          d.TAVG = d.TAVG === "" || +d.TAVG < -100 ? null : +d.TAVG;
          validData.push(d);
        }
      });

      console.log("Weather data:", validData);

      weatherData = validData; // set global variable

      // listen for feature dropdown changes
      d3.select("#feature-select").on("change", function () {
        selectedFeature = d3.select(this).property("value");
        updateLineChart();
      });

      // call setup, update functions
      setupAxes();
      updateLineChart();
    })
    .catch((error) => {
      console.error("Error loading the CSV file:", error);
    });
}

function setupAxes() {
  // remove old axes if they exist
  // alongside old titles and labels
  lineChartSvg.selectAll(".axis").remove();
  lineChartSvg.selectAll(".chart-label").remove();

  // X scale (time)
  // here just range for now
  xScaleLine = d3
    .scaleTime()
    // .domain(d3.extent(weatherData, (d) => d.date)) // earliest to latest in dataset
    // .domain([new Date(2017, 0, 1), new Date(2017, 11, 31)]) // say full year even if no existing data
    .range([0, width]);

  // add x axis
  xAxisGroup = lineChartSvg
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0, ${height})`);
  // .call(
  //   d3
  //     .axisBottom(xScaleLine)
  //     .ticks(d3.timeMonth.every(1))
  //     .tickFormat(d3.timeFormat("%b")),
  // );
  // .call(d3.axisBottom(xScaleLine).tickFormat(d3.timeFormat('%b')));

  // Y scale (linear)
  // note there can be negative temperatures
  // will do domain later
  yScaleLine = d3
    .scaleLinear()
    // .domain(d3.extent(weatherData, (d) => d[selectedFeature]))
    .range([height, 0]); // invert for svg  coords

  // append y axis group will fill later
  yAxisGroup = lineChartSvg.append("g").attr("class", "axis y-axis");
  // .call(d3.axisLeft(yScaleLine));

  // placeholders for y-axis, chart titles
  lineChartSvg
    .append("text")
    .attr("class", "chart-label y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 15)
    .style("text-anchor", "middle");

  lineChartSvg
    .append("text")
    .attr("class", "chart-label chart-title")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2 + 10)
    .style("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold");

  // xaxis label doesn't change
  lineChartSvg
    .append("text")
    .attr("class", "chart-label x-axis-label")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 5) // Pushed down below the axis
    .style("text-anchor", "middle")
    .text("Month");
}

function updateLineChart() {
  // filter by selected state (e.g. MD)
  let filteredData = weatherData.filter((d) => d.state === selectedState);

  // avg data per date with a rollup
  // for reference: https://d3js.org/d3-array/group#rollup
  currentAveragedData = Array.from(
    d3.rollup(
      filteredData,
      (v) => {
        // d3.mean(v, (x) => x[selectedFeature])
        // apply right calculation depending on the dropdown
        if (selectedFeature === "TMAX") return d3.max(v, (x) => x.TMAX);
        if (selectedFeature === "TMIN") return d3.min(v, (x) => x.TMIN);
        return d3.mean(v, (x) => x.TAVG);
      },
      (d) => d.date.getTime(),
    ),
    ([dateMs, avgTemp]) => ({ date: new Date(dateMs), value: avgTemp }),
  )
    .filter((d) => d.value !== undefined) // drop days where all stations lack data
    .sort((a, b) => a.date - b.date);

  // update yscale, redraw axis
  xScaleLine.domain(d3.extent(currentAveragedData, (d) => d.date));

  // lock yaxis for absolute min/max of entire country for current metric
  // this allows for easier comparisons when switching states.
  yScaleLine.domain(d3.extent(weatherData, (d) => d[selectedFeature])).nice();
  // TODO: REMOVE TWO LINES BELOW
  // // nice rounds axis to clean #'s
  // yScaleLine.domain(d3.extent(currentAveragedData, (d) => d.value)).nice();

  // dynamically update title, y-axis
  lineChartSvg.select(".y-axis-label").text(featureMappings[selectedFeature]);
  lineChartSvg
    .select(".chart-title")
    .text(`${featureMappings[selectedFeature]} in ${selectedState}`);

  // define line generator
  const lineGenerator = d3
    .line()
    .x((d) => xScaleLine(d.date))
    .y((d) => yScaleLine(d.value));

  // don't animate anything when the page first loads
  const shouldAnimate = !isFirstLoad;

  // redraw axes smoothly (if not first load)
  if (isFirstLoad) {
    xAxisGroup.call(
      d3
        .axisBottom(xScaleLine)
        .ticks(d3.timeMonth.every(1))
        .tickFormat(d3.timeFormat("%b"))
        .tickSizeOuter(0),
    );
    yAxisGroup.call(d3.axisLeft(yScaleLine).tickSizeOuter(0)); // remove outer ticks
    path.datum(currentAveragedData).attr("d", lineGenerator);
    isFirstLoad = false;
  } else {
    // smooth drawing
    xAxisGroup
      .transition()
      .duration(1000)
      .call(
        d3
          .axisBottom(xScaleLine)
          .ticks(d3.timeMonth.every(1))
          .tickFormat(d3.timeFormat("%b"))
          .tickSizeOuter(0),
      );
    yAxisGroup
      .transition()
      .duration(1000)
      .call(d3.axisLeft(yScaleLine).tickSizeOuter(0));
    path
      .datum(currentAveragedData)
      .transition()
      .duration(1000)
      .attr("d", lineGenerator);
  }

  updateCursor(shouldAnimate);
}

// create function for map.js to update chart
window.updateChartFromMap = function (newStateAbbr) {
  selectedState = newStateAbbr;

  // redraw linechart
  updateLineChart();
};

window.updateChartFromSlider = function (d) {
  cursorDate = d;
  // TODO: Remove this comment when done
  // updateLineChart();
  updateCursor(false);
};

// function to move cursor line and dot over the graph on the bottom
function updateCursor(animate = false) {
  if (!currentAveragedData || currentAveragedData.length === 0) {
    return;
  }

  const bisect = d3.bisector((d) => d.date).center;
  const i = bisect(currentAveragedData, cursorDate);
  const pt = currentAveragedData[i];
  if (!pt) {
    return;
  }

  const cursorX = xScaleLine(pt.date);
  const cursorY = yScaleLine(pt.value);

  // set up the line
  let cursorLine = lineChartSvg.selectAll(".cursor-line").data([pt]);
  let cursorLineMerged = cursorLine
    .enter()
    .append("line")
    .attr("class", "cursor-line")
    .attr("stroke", "white")
    .attr("stroke-opacity", 0.5)
    .attr("stroke-width", 2)
    .merge(cursorLine);

  // set up the dot and tooltip
  let cursorDot = lineChartSvg.selectAll(".cursor-dot").data([pt]);
  let cursorDotMerged = cursorDot
    .enter()
    .append("circle")
    .attr("class", "cursor-dot")
    .attr("r", 5) // Slightly larger so it's easier to hover
    .attr("fill", "white")
    .merge(cursorDot);

  // add hover effect to the dot
  cursorDotMerged
    .on("mouseover", function (event, d) {
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${d3.timeFormat("%b %d")(d.date)}</strong><br/>Value: ${d.value.toFixed(2)}`,
        );
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    });

  // animation logic (whether to include 1 second transition or not)
  if (animate) {
    cursorLineMerged
      .transition()
      .duration(1000)
      .attr("x1", cursorX)
      .attr("x2", cursorX)
      .attr("y1", 0)
      .attr("y2", height);

    cursorDotMerged
      .transition()
      .duration(1000)
      .attr("cx", cursorX)
      .attr("cy", cursorY);
  } else {
    cursorLineMerged
      .attr("x1", cursorX)
      .attr("x2", cursorX)
      .attr("y1", 0)
      .attr("y2", height);

    cursorDotMerged.attr("cx", cursorX).attr("cy", cursorY);
  }
}

// when the page opens run initialization
window.addEventListener("load", initLineChart);
