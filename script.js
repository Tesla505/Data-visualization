// =====================
// Setup
// =====================
const svg = d3.select("#chart");
const margin = {top: 20, right: 120, bottom: 50, left: 60};
const width = +svg.attr("width") - margin.left - margin.right;
const height = +svg.attr("height") - margin.top - margin.bottom;

const chart = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const barSvg = d3.select("#barChart");
const barChart = barSvg.append("g")
    .attr("transform", `translate(50,20)`);

const trendSvg = d3.select("#trendChart");
const trendChart = trendSvg.append("g")
    .attr("transform", `translate(50,20)`);

const compareSvg = d3.select("#compareChart");
const compareChart = compareSvg.append("g")
    .attr("transform", `translate(50,20)`);

const tooltip = d3.select("#tooltip");
const storyText = d3.select("#story");

const color = d3.scaleOrdinal()
    .range(['#5b8db8', '#c4785a', '#7ba05b', '#a87b9a']);

let data;
let currentMetric = 'absolute';
let compareMode = false;
let brushedRange = null;
let animationInterval = null;
let currentGrouping = 'none';
let isDarkMode = false;

// Country grouping configurations
const countryGroups = {
    developed: {
        'Developed': ['USA', 'Germany'],
        'Developing': ['China', 'India']
    },
    size: {
        'High Emitters': ['China', 'USA'],
        'Medium Emitters': ['India', 'Germany']
    },
    region: {
        'Asia': ['China', 'India'],
        'North America': ['USA'],
        'Europe': ['Germany']
    }
};

// =====================
// Load Data
// =====================
d3.csv("data.csv").then(rawData => {

    rawData.forEach(d => {
        d.Year = +d.Year;
        d.China = +d.China;
        d.USA = +d.USA;
        d.India = +d.India;
        d.Germany = +d.Germany;
    });

    data = rawData;
    const countries = ["China", "USA", "India", "Germany"];

    // Precompute derived metrics
    computeDerivedMetrics(data, countries);

    // Initialize visualization
    initializeVisualization(data, countries);
    setupEventListeners(countries);
    updateDerivedMetricsPanel(data, countries);
    drawTrendChart(data, countries);

});

// =====================
// Derived Metrics Computation
// =====================
function computeDerivedMetrics(data, countries) {
    // Growth Rate
    data.forEach((d, i) => {
        countries.forEach(country => {
            if (i === 0) {
                d[`${country}_growth`] = 0;
            } else {
                const prev = data[i - 1][country];
                d[`${country}_growth`] = prev !== 0 ? ((d[country] - prev) / prev) * 100 : 0;
            }
        });
    });

    // Cumulative
    countries.forEach(country => {
        let cumulative = 0;
        data.forEach(d => {
            cumulative += d[country];
            d[`${country}_cumulative`] = cumulative;
        });
    });

    // Rolling Average (3-year)
    countries.forEach(country => {
        data.forEach((d, i) => {
            if (i < 2) {
                d[`${country}_average`] = d[country];
            } else {
                const sum = data[i][country] + data[i-1][country] + data[i-2][country];
                d[`${country}_average`] = sum / 3;
            }
        });
    });
}

// =====================
// Metric Switching
// =====================
function getMetricValue(d, country, metric) {
    switch(metric) {
        case 'growth': return d[`${country}_growth`];
        case 'cumulative': return d[`${country}_cumulative`];
        case 'average': return d[`${country}_average`];
        default: return d[country];
    }
}

function updateMetric(metric) {
    currentMetric = metric;
    const countries = ["China", "USA", "India", "Germany"];
    
    // Update scales and redraw with transitions
    updateVisualization(data, countries);
    updateDerivedMetricsPanel(data, countries);
}

// =====================
// Initialize Visualization
// =====================
function initializeVisualization(data, countries) {
    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => Math.max(...countries.map(c => getMetricValue(d, c, currentMetric))))])
        .range([height, 0]);

    const xAxis = d3.axisBottom(x).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(y);

    chart.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis);

    chart.append("g")
        .attr("class", "y-axis")
        .call(yAxis);

    // Set initial colors for axes
    updateAxisColors();

    // Draw initial lines and dots
    drawLinesAndDots(data, countries, x, y);
    
    // Add legend
    addLegend(countries);
    
    // Add peak annotations
    addPeakAnnotations(data, countries, x, y);
    
    // Add brushing
    addBrushing(data, countries, x, y);
    
    // Add zoom
    addZoom();
}

function updateAxisColors() {
    const textColor = isDarkMode ? '#ffffff' : '#5a6c7d';
    const gridColor = isDarkMode ? '#222222' : '#d0d8e0';
    
    // Update all axis text
    d3.selectAll(".x-axis text, .y-axis text")
        .style("fill", textColor);
    
    // Update axis lines
    d3.selectAll(".x-axis .domain, .y-axis .domain")
        .style("stroke", gridColor);
    
    d3.selectAll(".x-axis .tick line, .y-axis .tick line")
        .style("stroke", gridColor);
}

// =====================
// Draw Lines and Dots
// =====================
function drawLinesAndDots(data, countries, x, y) {
    countries.forEach(country => {
        const line = d3.line()
            .x(d => x(d.Year))
            .y(d => y(getMetricValue(d, country, currentMetric)));

        chart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", color(country))
            .attr("stroke-width", 2)
            .attr("class", `line-${country}`)
            .attr("d", line)
            .style("opacity", 0)
            .transition()
            .duration(1000)
            .style("opacity", 1);

        chart.selectAll(`.dot-${country}`)
            .data(data)
            .enter()
            .append("circle")
            .attr("class", `dot-${country}`)
            .attr("cx", d => x(d.Year))
            .attr("cy", d => y(getMetricValue(d, country, currentMetric)))
            .attr("r", 0)
            .attr("fill", color(country))
            .on("mouseover", (event, d) => handleDotHover(event, d, country))
            .on("mouseout", () => tooltip.style("display", "none"))
            .transition()
            .duration(1000)
            .delay((d, i) => i * 50)
            .attr("r", 3);
    });
}

// =====================
// Handle Dot Hover
// =====================
function handleDotHover(event, d, country) {
    const value = getMetricValue(d, country, currentMetric);
    const metricLabel = getMetricLabel(currentMetric);
    
    tooltip.style("display", "block")
        .html(`<strong>${country}</strong><br>Year: ${d.Year}<br>${metricLabel}: ${formatNumber(value)}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");

    updateBarChart(d);
    updateStory(d);
    drawYearLine(d.Year);
}

function getMetricLabel(metric) {
    switch(metric) {
        case 'growth': return 'Growth Rate (%)';
        case 'cumulative': return 'Cumulative Emissions';
        case 'average': return '3-Year Average';
        default: return 'CO₂ Emissions';
    }
}

function formatNumber(num) {
    if (Math.abs(num) >= 1000000) {
        return d3.format(".2s")(num);
    }
    return d3.format(",.2f")(num);
}

// =====================
// Update Visualization (with transitions)
// =====================
function updateVisualization(data, countries) {
    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => Math.max(...countries.map(c => getMetricValue(d, c, currentMetric))))])
        .range([height, 0]);

    // Update axes with transitions
    chart.select(".x-axis")
        .transition()
        .duration(750)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    chart.select(".y-axis")
        .transition()
        .duration(750)
        .call(d3.axisLeft(y));

    // Update lines with transitions
    countries.forEach(country => {
        const line = d3.line()
            .x(d => x(d.Year))
            .y(d => y(getMetricValue(d, country, currentMetric)));

        chart.select(`.line-${country}`)
            .transition()
            .duration(750)
            .attr("d", line);

        chart.selectAll(`.dot-${country}`)
            .transition()
            .duration(750)
            .attr("cy", d => y(getMetricValue(d, country, currentMetric)));
    });
}

// =====================
// Legend
// =====================
function addLegend(countries) {
    let activeCountries = new Set(countries);

    const legend = svg.append("g")
        .attr("transform", `translate(${width + margin.left + 20}, 50)`);

    countries.forEach((country, i) => {
        const g = legend.append("g")
            .attr("transform", `translate(0, ${i * 25})`)
            .style("cursor", "pointer");

        g.append("rect")
            .attr("width", 15)
            .attr("height", 15)
            .attr("fill", color(country));

        g.append("text")
            .attr("x", 20)
            .attr("y", 12)
            .text(country);

        g.on("click", function () {
            if (activeCountries.has(country)) {
                activeCountries.delete(country);
                d3.select(this).style("opacity", 0.3);
            } else {
                activeCountries.add(country);
                d3.select(this).style("opacity", 1);
            }
            updateVisibility(countries, activeCountries);
        });

        g.on("mouseover", function () {
            countries.forEach(c => {
                chart.selectAll(`.line-${c}`)
                    .style("opacity", c === country ? 1 : 0.1)
                    .style("stroke-width", c === country ? 4 : 2);
            });
        });

        g.on("mouseout", function () {
            countries.forEach(c => {
                chart.selectAll(`.line-${c}`)
                    .style("opacity", 1)
                    .style("stroke-width", 2);
            });
        });
    });
}

function updateVisibility(countries, activeCountries) {
    countries.forEach(country => {
        const visible = activeCountries.has(country);
        chart.selectAll(`.line-${country}`)
            .style("display", visible ? null : "none");
        chart.selectAll(`.dot-${country}`)
            .style("display", visible ? null : "none");
    });
}

// =====================
// Peak Annotations
// =====================
function addPeakAnnotations(data, countries, x, y) {
    countries.forEach(country => {
        const maxValue = d3.max(data, d => getMetricValue(d, country, currentMetric));
        const peak = data.find(d => getMetricValue(d, country, currentMetric) === maxValue);

        chart.append("circle")
            .attr("cx", x(peak.Year))
            .attr("cy", y(getMetricValue(peak, country, currentMetric)))
            .attr("r", 5)
            .attr("fill", "#c0392b")
            .attr("opacity", 0.8);

        chart.append("text")
            .attr("x", x(peak.Year) + 8)
            .attr("y", y(getMetricValue(peak, country, currentMetric)) - 8)
            .attr("class", "annotation")
            .text(`${country} Peak (${peak.Year})`);
    });
}

// =====================
// Brushing (Time Range Selection)
// =====================
function addBrushing(data, countries, x, y) {
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("brush end", (event) => {
            if (!event.selection) {
                brushedRange = null;
                d3.select("#brush-info").text("Select a time range by brushing on the chart");
                return;
            }

            const [x0, x1] = event.selection.map(x.invert);
            brushedRange = [Math.round(x0), Math.round(x1)];
            
            d3.select("#brush-info").text(
                `Selected: ${brushedRange[0]} - ${brushedRange[1]} (${brushedRange[1] - brushedRange[0] + 1} years)`
            );

            // Filter data and update other views
            const filteredData = data.filter(d => d.Year >= brushedRange[0] && d.Year <= brushedRange[1]);
            updateDerivedMetricsPanel(filteredData, countries);
            updateInsights(filteredData, countries);
        });

    chart.append("g")
        .attr("class", "brush")
        .call(brush);
}

// =====================
// Zoom
// =====================
function addZoom() {
    const zoom = d3.zoom()
        .scaleExtent([1, 5])
        .on("zoom", (event) => {
            chart.attr("transform",
                `translate(${margin.left + event.transform.x},${margin.top}) scale(${event.transform.k},1)`
            );
        });

    svg.call(zoom);
}

// =====================
// Storytelling & Insights
// =====================
function updateStory(d) {
    const countries = ["China", "USA", "India", "Germany"];
    let msg = `In ${d.Year}, `;
    const maxCountry = countries.reduce((a, b) => getMetricValue(d, a, currentMetric) > getMetricValue(d, b, currentMetric) ? a : b);
    msg += `${maxCountry} had the highest ${getMetricLabel(currentMetric).toLowerCase()}.`;

    if (d.Year >= 2005 && d.Year <= 2010)
        msg += " Rapid industrial growth observed.";

    if (d.Year >= 2015)
        msg += " Emissions begin stabilizing.";

    storyText.text(msg);
}

function updateInsights(filteredData, countries) {
    if (filteredData.length === 0) return;

    const insights = [];
    
    // Find highest growth
    countries.forEach(country => {
        const growthValues = filteredData.map(d => getMetricValue(d, country, 'growth'));
        const maxGrowth = d3.max(growthValues);
        const maxGrowthYear = filteredData[growthValues.indexOf(maxGrowth)].Year;
        
        if (maxGrowth > 10) {
            insights.push(`${country} had highest growth (${maxGrowth.toFixed(1)}%) in ${maxGrowthYear}`);
        }
    });

    // Find trend
    const firstYear = filteredData[0];
    const lastYear = filteredData[filteredData.length - 1];
    
    countries.forEach(country => {
        const change = getMetricValue(lastYear, country, currentMetric) - getMetricValue(firstYear, country, currentMetric);
        const direction = change > 0 ? "increased" : "decreased";
        insights.push(`${country} ${direction} by ${formatNumber(Math.abs(change))}`);
    });

    storyText.html(insights.slice(0, 3).join("<br><br>"));
}

// =====================
// Year Indicator
// =====================
function drawYearLine(year) {
    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Year))
        .range([0, width]);

    chart.selectAll(".year-line").remove();

    chart.append("line")
        .attr("class", "year-line")
        .attr("x1", x(year))
        .attr("x2", x(year))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#c0392b")
        .attr("stroke-dasharray", "4")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.6);
}

// =====================
// Bar Chart
// =====================
function updateBarChart(d) {
    const countries = ["China", "USA", "India", "Germany"];
    barChart.selectAll("*").remove();

    const xBar = d3.scaleBand()
        .domain(countries)
        .range([0, 340])
        .padding(0.35);

    const yBar = d3.scaleLinear()
        .domain([0, d3.max(countries, c => getMetricValue(d, c, currentMetric))])
        .range([250, 0]);

    const axisColor = isDarkMode ? '#ffffff' : '#5a6c7d';

    barChart.append("g")
        .attr("transform", "translate(0,250)")
        .call(d3.axisBottom(xBar).tickSize(0))
        .selectAll("text")
        .style("font-size", "12px")
        .style("font-weight", "500")
        .style("fill", axisColor);

    barChart.append("g")
        .call(d3.axisLeft(yBar).ticks(5).tickFormat(formatNumber).tickSize(0))
        .selectAll("text")
        .style("font-size", "11px")
        .style("fill", axisColor);

    // Remove axis lines for cleaner look
    barChart.selectAll(".domain").remove();

    barChart.selectAll("rect")
        .data(countries)
        .enter()
        .append("rect")
        .attr("x", c => xBar(c))
        .attr("y", c => yBar(getMetricValue(d, c, currentMetric)))
        .attr("width", xBar.bandwidth())
        .attr("height", c => 250 - yBar(getMetricValue(d, c, currentMetric)))
        .attr("fill", c => color(c))
        .attr("rx", 3)
        .attr("opacity", 0.85)
        .style("opacity", 0)
        .transition()
        .duration(500)
        .style("opacity", 0.85)
        .on("end", function() {
            d3.select(this)
                .on("mouseover", function(event) {
                    d3.select(this).attr("opacity", 1);
                })
                .on("mouseout", function() {
                    d3.select(this).attr("opacity", 0.85);
                });
        });
}

// =====================
// Trend Chart
// =====================
function drawTrendChart(data, countries) {
    trendChart.selectAll("*").remove();

    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Year))
        .range([0, 340]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => Math.max(...countries.map(c => getMetricValue(d, c, 'growth'))))])
        .range([250, 0]);

    const axisColor = isDarkMode ? '#ffffff' : '#5a6c7d';

    trendChart.append("g")
        .attr("transform", "translate(0,250)")
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).tickSize(0))
        .selectAll("text")
        .style("font-size", "12px")
        .style("font-weight", "500")
        .style("fill", axisColor);

    trendChart.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "%").tickSize(0))
        .selectAll("text")
        .style("font-size", "11px")
        .style("fill", axisColor);

    // Remove axis lines for cleaner look
    trendChart.selectAll(".domain").remove();

    countries.forEach(country => {
        const line = d3.line()
            .x(d => x(d.Year))
            .y(d => y(getMetricValue(d, country, 'growth')));

        trendChart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", color(country))
            .attr("stroke-width", 2)
            .attr("opacity", 0.75)
            .attr("d", line);
    });
}

// =====================
// Derived Metrics Panel
// =====================
function updateDerivedMetricsPanel(data, countries) {
    const metricsContent = d3.select("#metrics-content");
    metricsContent.selectAll("*").remove();

    const metrics = [
        { label: "Total Emissions", value: d3.sum(data, d => d.China + d.USA + d.India + d.Germany) },
        { label: "Avg Yearly Emissions", value: d3.mean(data, d => d.China + d.USA + d.India + d.Germany) },
        { label: "Peak Year", value: findPeakYear(data, countries) },
        { label: "Years Tracked", value: data.length }
    ];

    metrics.forEach(m => {
        const card = metricsContent.append("div")
            .attr("class", "metric-card");
        
        card.append("div")
            .attr("class", "label")
            .text(m.label);
        
        card.append("div")
            .attr("class", "value")
            .text(typeof m.value === 'number' ? formatNumber(m.value) : m.value);
    });
}

function findPeakYear(data, countries) {
    let peakYear = null;
    let peakValue = -Infinity;
    
    data.forEach(d => {
        const total = countries.reduce((sum, c) => sum + d[c], 0);
        if (total > peakValue) {
            peakValue = total;
            peakYear = d.Year;
        }
    });
    
    return peakYear;
}

// =====================
// Search Functionality
// =====================
function setupSearch(countries) {
    d3.select("#searchInput").on("input", function() {
        const query = this.value.toLowerCase().trim();
        
        if (!query) {
            countries.forEach(country => {
                chart.selectAll(`.line-${country}`)
                    .classed("highlight-search", false)
                    .style("opacity", 1);
            });
            // Remove any year lines
            chart.selectAll(".year-search-line").remove();
            return;
        }

        // Search for country
        const matchedCountry = countries.find(c => c.toLowerCase().includes(query));
        if (matchedCountry) {
            // Remove year lines if any
            chart.selectAll(".year-search-line").remove();
            
            countries.forEach(country => {
                const isMatch = country === matchedCountry;
                chart.selectAll(`.line-${country}`)
                    .classed("highlight-search", isMatch)
                    .style("opacity", isMatch ? 1 : 0.15);
            });
            return;
        }

        // Search for year
        const yearMatch = parseInt(query);
        if (!isNaN(yearMatch) && yearMatch >= 2000 && yearMatch <= 2019) {
            const yearData = data.find(d => d.Year === yearMatch);
            if (yearData) {
                // Draw a vertical line at the searched year
                chart.selectAll(".year-search-line").remove();
                
                const yearLine = chart.append("line")
                    .attr("class", "year-search-line")
                    .attr("x1", xScale(yearMatch))
                    .attr("x2", xScale(yearMatch))
                    .attr("y1", 0)
                    .attr("y2", height)
                    .attr("stroke", isDarkMode ? "#06b6d4" : "#f59e0b")
                    .attr("stroke-width", 3)
                    .attr("stroke-dasharray", "8,4")
                    .attr("opacity", 0.8);
                
                // Add label
                chart.append("text")
                    .attr("class", "year-search-line")
                    .attr("x", xScale(yearMatch) + 5)
                    .attr("y", 20)
                    .text(`Year: ${yearMatch}`)
                    .attr("fill", isDarkMode ? "#06b6d4" : "#f59e0b")
                    .attr("font-size", "14px")
                    .attr("font-weight", "bold");
                
                // Reset country opacities
                countries.forEach(country => {
                    chart.selectAll(`.line-${country}`)
                        .classed("highlight-search", false)
                        .style("opacity", 1);
                });
            }
        } else if (!isNaN(yearMatch)) {
            // Invalid year range - clear the line
            chart.selectAll(".year-search-line").remove();
        }
    });
}

// =====================
// Compare Mode
// =====================
function toggleCompareMode(countries) {
    compareMode = !compareMode;
    
    const btn = d3.select("#compareBtn");
    btn.text(compareMode ? "ON" : "OFF")
       .classed("active", compareMode);
    
    d3.select("#compare-view").style("display", compareMode ? "block" : "none");
    
    if (compareMode && data) {
        populateYearSelector();
        updateCompareView(data, countries);
    }
}

function populateYearSelector() {
    const select = document.getElementById("compareYearSelect");
    
    // Clear existing options
    select.innerHTML = "";
    
    // Add all years from data
    data.forEach(d => {
        const option = document.createElement("option");
        option.value = d.Year;
        option.textContent = d.Year;
        select.appendChild(option);
    });
    
    // Set default to last year
    if (data.length > 0) {
        select.value = data[data.length - 1].Year;
    }
    
    // Add event listener
    select.onchange = function() {
        const countries = ["China", "USA", "India", "Germany"];
        updateCompareView(data, countries);
    };
}

function updateCompareView(data, countries) {
    compareChart.selectAll("*").remove();

    const width = 380;
    const height = 280;
    const centerX = width / 2;
    const centerY = height / 2 + 10;
    const radius = 80;

    // Get selected year from dropdown
    const selectedYear = parseInt(document.getElementById("compareYearSelect").value);
    const selectedData = data.find(d => d.Year === selectedYear);
    
    if (!selectedData) return;

    // Calculate metrics for selected year
    const metrics = countries.map(country => ({
        name: country,
        value: getMetricValue(selectedData, country, currentMetric),
        color: color(country)
    }));

    const maxValue = d3.max(metrics, d => d.value);
    const angleSlice = (Math.PI * 2) / countries.length;

    // Add title with selected year
    compareChart.append("text")
        .attr("x", width / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .text(`${selectedYear} - ${getMetricLabel(currentMetric)}`)
        .style("font-size", "13px")
        .style("font-weight", "700")
        .style("fill", isDarkMode ? "#ffffff" : "#2c3e50");

    // Background circles (radial grid)
    for (let i = 1; i <= 4; i++) {
        const r = (radius / 4) * i;
        compareChart.append("circle")
            .attr("cx", centerX)
            .attr("cy", centerY)
            .attr("r", r)
            .attr("fill", "none")
            .attr("stroke", isDarkMode ? "#1a1a1a" : "#e0e0e0")
            .attr("stroke-width", 0.5);
    }

    // Draw radial bars with labels OUTSIDE the circle
    metrics.forEach((metric, i) => {
        const startAngle = angleSlice * i - Math.PI / 2;
        const endAngle = startAngle + angleSlice * 0.7;
        const midAngle = (startAngle + endAngle) / 2;
        const barRadius = (metric.value / maxValue) * radius;

        // Create arc path (radial bar)
        const arc = d3.arc()
            .innerRadius(15)
            .outerRadius(barRadius)
            .startAngle(startAngle)
            .endAngle(endAngle);

        compareChart.append("path")
            .attr("d", arc)
            .attr("transform", `translate(${centerX},${centerY})`)
            .attr("fill", metric.color)
            .attr("opacity", 0.8)
            .style("cursor", "pointer")
            .on("mouseover", function(event) {
                d3.select(this).attr("opacity", 1);
                tooltip.style("display", "block")
                    .html(`<strong>${metric.name}</strong><br>${getMetricLabel(currentMetric)}: ${formatNumber(metric.value)}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function() {
                d3.select(this).attr("opacity", 0.8);
                tooltip.style("display", "none");
            });

        // Position label OUTSIDE the circle (radius + 35px)
        const labelRadius = radius + 35;
        const labelX = centerX + labelRadius * Math.cos(midAngle);
        const labelY = centerY + labelRadius * Math.sin(midAngle);

        // Smart text anchor based on position
        let textAnchor = "middle";
        if (Math.cos(midAngle) > 0.2) textAnchor = "start";
        else if (Math.cos(midAngle) < -0.2) textAnchor = "end";

        // Country name (outside circle)
        compareChart.append("text")
            .attr("x", labelX)
            .attr("y", labelY - 7)
            .attr("text-anchor", textAnchor)
            .attr("dominant-baseline", "middle")
            .text(metric.name)
            .style("font-size", "12px")
            .style("font-weight", "700")
            .style("fill", isDarkMode ? "#ffffff" : "#2c3e50");

        // Value (below country name, outside circle)
        compareChart.append("text")
            .attr("x", labelX)
            .attr("y", labelY + 7)
            .attr("text-anchor", textAnchor)
            .attr("dominant-baseline", "middle")
            .text(formatNumber(metric.value))
            .style("font-size", "10px")
            .style("font-weight", "500")
            .style("fill", isDarkMode ? "#f0f0f0" : "#5a6c7d");
    });

    // Center circle with year
    compareChart.append("circle")
        .attr("cx", centerX)
        .attr("cy", centerY)
        .attr("r", 15)
        .attr("fill", isDarkMode ? "#0a0a0a" : "#f5f5f5")
        .attr("stroke", isDarkMode ? "#333333" : "#d0d0d0")
        .attr("stroke-width", 1);

    compareChart.append("text")
        .attr("x", centerX)
        .attr("y", centerY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(selectedYear)
        .style("font-size", "11px")
        .style("font-weight", "700")
        .style("fill", isDarkMode ? "#ffffff" : "#2c3e50");
}

// =====================
// Auto Insight Detection
// =====================
function detectAutoInsights(data, countries) {
    const insights = [];

    // 1. Highest emitter overall
    const totals = countries.map(country => ({
        country,
        total: d3.sum(data, d => d[country])
    }));
    const highestEmitter = totals.reduce((a, b) => a.total > b.total ? a : b);
    insights.push(`&#127942; ${highestEmitter.country} is the highest total emitter (${formatNumber(highestEmitter.total)})`);

    // 2. Fastest growing
    const growthRates = countries.map(country => {
        const first = data[0][country];
        const last = data[data.length - 1][country];
        const growth = ((last - first) / first) * 100;
        return { country, growth };
    });
    const fastestGrowth = growthRates.reduce((a, b) => a.growth > b.growth ? a : b);
    insights.push(`&#128200; ${fastestGrowth.country} grew fastest (${fastestGrowth.growth.toFixed(1)}% over the period)`);

    // 3. Most volatile
    const volatility = countries.map(country => {
        const values = data.map(d => d[country]);
        const mean = d3.mean(values);
        const std = Math.sqrt(d3.mean(values.map(v => Math.pow(v - mean, 2))));
        return { country, volatility: std / mean };
    });
    const mostVolatile = volatility.reduce((a, b) => a.volatility > b.volatility ? a : b);
    insights.push(`&#128202; ${mostVolatile.country} has the most variable emissions pattern`);

    // 4. Peak year insight
    const peakYear = findPeakYear(data, countries);
    insights.push(`&#9889; Peak emissions year: ${peakYear}`);

    // 5. Recent trend
    const recentData = data.slice(-3);
    const recentTrend = countries.map(country => {
        const trend = recentData[2][country] - recentData[0][country];
        return { country, trend };
    });
    const declining = recentTrend.filter(t => t.trend < 0);
    if (declining.length > 0) {
        insights.push(`&#10004; ${declining.map(t => t.country).join(', ')} showing declining trend recently`);
    }

    return insights;
}

function displayAutoInsights() {
    if (!data) return;
    
    const countries = ["China", "USA", "India", "Germany"];
    const insights = detectAutoInsights(data, countries);
    
    const insightsPanel = d3.select("#insights");
    insightsPanel.select("h3").text("Auto-Detected Insights");
    
    const bgColor = isDarkMode ? '#0a0a0a' : 'white';
    const textColor = isDarkMode ? '#ffffff' : '#2c3e50';
    const borderColor = isDarkMode ? '#1a1a1a' : '#e2e8f0';
    
    // Display each insight as a separate styled paragraph
    const insightsHTML = insights.map(insight => 
        `<p style="margin: 10px 0; padding: 12px; background: ${bgColor}; border-radius: 8px; color: ${textColor}; border-left: 3px solid #6366f1; line-height: 1.6;">${insight}</p>`
    ).join('');
    
    storyText.html(insightsHTML);
}

// =====================
// Event Listeners
// =====================
function setupEventListeners(countries) {
    // Metric switching
    d3.select("#metricSelect").on("change", function() {
        updateMetric(this.value);
    });

    // Country grouping
    d3.select("#groupSelect").on("change", function() {
        currentGrouping = this.value;
        applyCountryGrouping(countries);
    });

    // Dark mode toggle (backup listener)
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
        themeBtn.addEventListener("click", function(e) {
            console.log("Theme button clicked via event listener");
            e.preventDefault();
            window.toggleDarkMode();
        });
    }

    // Compare mode
    d3.select("#compareBtn").on("click", () => {
        toggleCompareMode(countries);
    });

    // Auto insight
    d3.select("#autoInsight").on("click", () => {
        displayAutoInsights();
    });

    // Reset zoom
    d3.select("#resetZoom").on("click", () => {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    });

    // Play animation
    d3.select("#playBtn").on("click", () => {
        playAnimation(data);
    });

    // Search
    setupSearch(countries);
}

// =====================
// Animation
// =====================
function playAnimation(data) {
    if (animationInterval) {
        clearInterval(animationInterval);
    }

    let index = 0;
    const countries = ["China", "USA", "India", "Germany"];

    animationInterval = setInterval(() => {
        if (index >= data.length) {
            clearInterval(animationInterval);
            animationInterval = null;
            return;
        }

        const d = data[index];
        updateBarChart(d);
        updateStory(d);
        drawYearLine(d.Year);
        
        // Update comparison chart if in compare mode
        if (compareMode) {
            updateCompareView(data, countries);
        }

        index++;
    }, 1000);
}

// =====================
// Country Grouping
// =====================
function applyCountryGrouping(countries) {
    if (currentGrouping === 'none') {
        // Reset to individual countries
        resetGrouping(countries);
        return;
    }

    const groups = countryGroups[currentGrouping];
    const groupEntries = Object.entries(groups);
    
    // Clear existing chart elements
    chart.selectAll(".line-group").remove();
    chart.selectAll(".dot-group").remove();
    chart.selectAll(".group-label").remove();
    
    // Hide individual country lines
    countries.forEach(country => {
        chart.selectAll(`.line-${country}`).style("display", "none");
        chart.selectAll(`.dot-${country}`).style("display", "none");
    });

    // Create aggregated data for each group
    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Year))
        .range([0, width]);

    const groupData = groupEntries.map(([groupName, groupCountries]) => {
        return data.map(d => {
            const aggregated = groupCountries.reduce((sum, country) => {
                return sum + getMetricValue(d, country, currentMetric);
            }, 0);
            return { Year: d.Year, value: aggregated, countries: groupCountries };
        });
    });

    // Update Y scale for grouped data
    const maxGroupValue = d3.max(groupData, group => 
        d3.max(group, d => d.value)
    );

    const y = d3.scaleLinear()
        .domain([0, maxGroupValue])
        .range([height, 0]);

    // Draw grouped lines
    const groupColors = d3.scaleOrdinal()
        .domain(groupEntries.map(g => g[0]))
        .range(['#b87a6b', '#6b9b8a', '#7b8ba8']);

    groupEntries.forEach(([groupName, groupCountries], i) => {
        const line = d3.line()
            .x(d => x(d.Year))
            .y(d => y(d.value));

        // Add group line
        chart.append("path")
            .datum(groupData[i])
            .attr("fill", "none")
            .attr("stroke", groupColors(groupName))
            .attr("stroke-width", 3)
            .attr("class", `line-group group-${i}`)
            .attr("d", line)
            .style("opacity", 0)
            .transition()
            .duration(1000)
            .style("opacity", 1);

        // Add group dots
        chart.selectAll(`.dot-group-${i}`)
            .data(groupData[i])
            .enter()
            .append("circle")
            .attr("class", `dot-group group-${i}`)
            .attr("cx", d => x(d.Year))
            .attr("cy", d => y(d.value))
            .attr("r", 4)
            .attr("fill", groupColors(groupName))
            .on("mouseover", (event, d) => {
                tooltip.style("display", "block")
                    .html(`<strong>${groupName}</strong><br>Year: ${d.Year}<br>Combined: ${formatNumber(d.value)}<br>Countries: ${d.countries.join(', ')}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => tooltip.style("display", "none"));

        // Add group label in legend area
        chart.append("text")
            .attr("class", "group-label")
            .attr("x", width + 10)
            .attr("y", 50 + i * 30)
            .attr("fill", groupColors(groupName))
            .text(`${groupName} (${groupCountries.length} countries)`);
    });

    // Update insights
    updateGroupInsights(groupData, groupEntries);
}

function resetGrouping(countries) {
    // Remove grouped elements
    chart.selectAll(".line-group").remove();
    chart.selectAll(".dot-group").remove();
    chart.selectAll(".group-label").remove();

    // Show individual country lines
    countries.forEach(country => {
        chart.selectAll(`.line-${country}`).style("display", null);
        chart.selectAll(`.dot-${country}`).style("display", null);
    });

    // Restore original legend
    svg.select("g").selectAll("*").remove();
    addLegend(countries);
}

function updateGroupInsights(groupData, groupEntries) {
    const insights = [];
    
    groupEntries.forEach(([groupName, groupCountries], i) => {
        const group = groupData[i];
        const firstValue = group[0].value;
        const lastValue = group[group.length - 1].value;
        const change = ((lastValue - firstValue) / firstValue) * 100;
        
        insights.push(`<strong>${groupName}</strong>: ${change > 0 ? 'Increased' : 'Decreased'} by ${Math.abs(change).toFixed(1)}%`);
    });

    storyText.html(insights.join("<br><br>"));
}

// =====================
// Dark Mode Toggle
// =====================
window.toggleDarkMode = function() {
    console.log("Dark mode toggle clicked! Current state:", isDarkMode);
    
    isDarkMode = !isDarkMode;
    
    console.log("New dark mode state:", isDarkMode);
    
    try {
        if (isDarkMode) {
            document.body.classList.add("dark-mode");
            const themeBtn = document.getElementById("themeBtn");
            if (themeBtn) {
                themeBtn.textContent = "\u2600\uFE0F Light";
                themeBtn.classList.add("active");
                console.log("Theme button updated to Light");
            }
        } else {
            document.body.classList.remove("dark-mode");
            const themeBtn = document.getElementById("themeBtn");
            if (themeBtn) {
                themeBtn.textContent = "\uD83C\uDF19 Dark";
                themeBtn.classList.remove("active");
                console.log("Theme button updated to Dark");
            }
        }
        
        // Force update all SVG elements
        forceUpdateAllCharts();
        
        // If compare mode is active, refresh it
        if (compareMode && data) {
            const countries = ["China", "USA", "India", "Germany"];
            updateCompareView(data, countries);
        }
        
        console.log("Dark mode toggle completed successfully");
    } catch (error) {
        console.error("Error in toggleDarkMode:", error);
    }
}

function forceUpdateAllCharts() {
    const textColor = isDarkMode ? '#ffffff' : '#5a6c7d';
    const gridColor = isDarkMode ? '#222222' : '#d0d8e0';
    const chartBg = isDarkMode ? '#000000' : '#fafbfc';
    
    // Update ALL SVG elements directly
    d3.selectAll("svg")
        .style("background", chartBg);
    
    // Update all text in all charts
    d3.selectAll("#chart text, #barChart text, #trendChart text, #compareChart text")
        .style("fill", textColor);
    
    // Update all axis lines
    d3.selectAll("#chart .domain, #barChart .domain, #trendChart .domain, #compareChart .domain")
        .style("stroke", gridColor);
    
    d3.selectAll("#chart .tick line, #barChart .tick line, #trendChart .tick line")
        .style("stroke", gridColor);
    
    // Update HTML elements
    if (isDarkMode) {
        d3.select("#story").style("color", "#ffffff");
        d3.select(".brush-info").style("color", "#4da6ff");
        d3.selectAll(".metric-card .label").style("color", "#888888");
        d3.selectAll(".metric-card .value").style("color", "#4da6ff");
        d3.selectAll(".insights-panel h3, .metrics-panel h3, .compare-panel h3, .chart-container h3")
            .style("color", "#4da6ff");
        d3.selectAll(".control-group label").style("color", "#f0f0f0");
    } else {
        d3.select("#story").style("color", "");
        d3.select(".brush-info").style("color", "");
        d3.selectAll(".metric-card .label").style("color", "");
        d3.selectAll(".metric-card .value").style("color", "");
        d3.selectAll(".insights-panel h3, .metrics-panel h3, .compare-panel h3, .chart-container h3")
            .style("color", "");
        d3.selectAll(".control-group label").style("color", "");
    }
}

function updateChartTheme(isDark) {
    const textColor = isDark ? '#d4d8dc' : '#2c3e50';
    const textSecondary = isDark ? '#a8b0b8' : '#5a6c7d';
    const gridColor = isDark ? '#3a424a' : '#d0d8e0';
    const chartBg = isDark ? '#222830' : '#fafbfc';
    
    // Update all SVG backgrounds
    d3.selectAll("svg")
        .transition()
        .duration(500)
        .style("background", chartBg);
    
    // Update all SVG text elements
    d3.selectAll("svg text")
        .transition()
        .duration(500)
        .style("fill", textSecondary);
    
    // Update axis lines and ticks
    d3.selectAll(".domain, .tick line")
        .transition()
        .duration(500)
        .style("stroke", gridColor);
    
    // Update HTML text colors for better readability
    if (isDark) {
        d3.selectAll("#story, .brush-info").style("color", "#c8d0d8");
        d3.selectAll(".metric-card .label").style("color", "#8a949e");
        d3.selectAll(".metric-card .value").style("color", "#a8c8e8");
        d3.selectAll(".insights-panel h3, .metrics-panel h3, .compare-panel h3, .chart-container h3")
            .style("color", "#8aa8c8");
        d3.selectAll(".control-group label").style("color", "#b8c0c8");
    } else {
        d3.selectAll("#story").style("color", "");
        d3.selectAll(".brush-info").style("color", "");
        d3.selectAll(".metric-card .label").style("color", "");
        d3.selectAll(".metric-card .value").style("color", "");
        d3.selectAll(".insights-panel h3, .metrics-panel h3, .compare-panel h3, .chart-container h3")
            .style("color", "");
        d3.selectAll(".control-group label").style("color", "");
    }
}
