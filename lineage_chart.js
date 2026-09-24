(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.LineageChart = exports.LineageChart;
    root.LineageCell = exports.LineageCell;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIMESTAMP_HEIGHT = 100;
  var MAX_CELL_RECT_WIDTH = 80;
  var CELL_HEIGHT = 30;
  var CELL_SPACING = 10;
  var HORIZONTAL_MARGIN = 20;
  var TOOLTIP_BACKGROUND_COLOR = "rgba(0, 0, 0, 0.8)";
  var TOOLTIP_TEXT_COLOR = "#fff";
  var TIMESTAMP_BAND_EVEN_COLOR = "#f2f2f2";
  var TIMESTAMP_BAND_ODD_COLOR = "#ffffff";
  var TIMESTAMP_BAND_HOVER_COLOR = "cornsilk";
  var LINK_STROKE_COLOR = "#444";
  var CELL_STROKE_COLOR = "#222";

  function LineageCell(identityString, timestamp, defaultColor, parentId) {
    this.identityString = identityString;
    this.timestamp = timestamp;
    this.defaultColor = defaultColor;
    this.parentId = parentId;
    this.child0 = null;
    this.child1 = null;
    this.x = null;
    this.color = null;
  }

  function LineageChart(containerDomElement) {
    if (!(this instanceof LineageChart)) {
      return new LineageChart(containerDomElement);
    }
    if (!containerDomElement) {
      throw new Error("A container DOM element is required.");
    }
    if (typeof d3 === "undefined") {
      throw new Error("D3 must be available globally as d3.");
    }

    this.container = containerDomElement;
    this.cells = {};
    this.clickCallback = null;

    if (window.getComputedStyle(this.container).position === "static") {
      this.container.style.position = "relative";
    }

    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("class", "lineage-chart-svg");

    this.tooltip = d3
      .select(this.container)
      .append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("padding", "4px 8px")
      .style("font-size", "12px")
      .style("background", TOOLTIP_BACKGROUND_COLOR)
      .style("color", TOOLTIP_TEXT_COLOR)
      .style("border-radius", "4px")
      .style("opacity", 0);
  }

  LineageChart.TIMESTAMP_HEIGHT = TIMESTAMP_HEIGHT;
  LineageChart.MAX_CELL_RECT_WIDTH = MAX_CELL_RECT_WIDTH;

  LineageChart.prototype.on_click = function (callback) {
    this.clickCallback = callback;
    return this;
  };

  LineageChart.prototype.load = function (jsonData) {
    if (!jsonData || typeof jsonData !== "object") {
      throw new Error("load(jsonData) requires an object.");
    }
    var inputCells = jsonData.cells || {};
    this.cells = {};

    var ids = Object.keys(inputCells).sort();
    for (var i = 0; i < ids.length; i += 1) {
      var identity = ids[i];
      var c = inputCells[identity];
      this.cells[identity] = new LineageCell(
        identity,
        c.timestamp,
        c.color,
        c.parent === undefined ? null : c.parent
      );
    }

    for (var j = 0; j < ids.length; j += 1) {
      var childId = ids[j];
      var child = this.cells[childId];
      if (child.parentId === null) {
        continue;
      }
      var parent = this.cells[child.parentId];
      if (!parent) {
        throw new Error("Missing parent cell: " + child.parentId);
      }
      if (child.timestamp !== parent.timestamp + 1) {
        throw new Error(
          "Child " +
            child.identityString +
            " must be at timestamp parent.timestamp + 1."
        );
      }
      if (parent.child0 === null) {
        parent.child0 = child;
      } else if (parent.child1 === null) {
        parent.child1 = child;
      } else {
        throw new Error(
          "Parent " + parent.identityString + " cannot have more than 2 children."
        );
      }
    }

    var roots = [];
    for (var k = 0; k < ids.length; k += 1) {
      var cell = this.cells[ids[k]];
      if (cell.parentId === null) {
        roots.push(cell);
      }
    }
    roots.sort(function (a, b) {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.identityString < b.identityString ? -1 : a.identityString > b.identityString ? 1 : 0;
    });

    var currentX = 0;
    var visited = {};
    var active = {};

    function layoutCell(lineageCell) {
      if (visited[lineageCell.identityString]) {
        return;
      }
      if (active[lineageCell.identityString]) {
        throw new Error("Cycle detected at " + lineageCell.identityString);
      }
      active[lineageCell.identityString] = true;

      if (lineageCell.child0) {
        layoutCell(lineageCell.child0);
      }
      if (lineageCell.child1) {
        layoutCell(lineageCell.child1);
      }

      var childCount = 0;
      if (lineageCell.child0) {
        childCount += 1;
      }
      if (lineageCell.child1) {
        childCount += 1;
      }

      if (childCount === 0) {
        lineageCell.x = currentX;
        currentX += 1;
        lineageCell.color = lineageCell.defaultColor;
      } else if (childCount === 1) {
        var onlyChild = lineageCell.child0 || lineageCell.child1;
        lineageCell.x = onlyChild.x;
        lineageCell.color = onlyChild.color;
      } else if (childCount === 2) {
        lineageCell.x = (lineageCell.child0.x + lineageCell.child1.x) / 2;
        lineageCell.color = lineageCell.defaultColor;
      } else {
        throw new Error("Invalid child count for " + lineageCell.identityString);
      }

      visited[lineageCell.identityString] = true;
      delete active[lineageCell.identityString];
    }

    for (var r = 0; r < roots.length; r += 1) {
      layoutCell(roots[r]);
    }
    for (var m = 0; m < ids.length; m += 1) {
      layoutCell(this.cells[ids[m]]);
    }

    var timestamps = [];
    var timestampIndex = {};
    for (var n = 0; n < ids.length; n += 1) {
      var ts = this.cells[ids[n]].timestamp;
      if (!timestampIndex.hasOwnProperty(ts)) {
        timestampIndex[ts] = true;
        timestamps.push(ts);
      }
    }
    timestamps.sort(function (a, b) {
      return a - b;
    });

    var rowByTimestamp = {};
    for (var t = 0; t < timestamps.length; t += 1) {
      rowByTimestamp[timestamps[t]] = t;
    }

    var chartWidth = jsonData.width || this.container.clientWidth || 800;
    var chartHeight = Math.max(1, timestamps.length) * TIMESTAMP_HEIGHT;
    this.svg.attr("width", chartWidth).attr("height", chartHeight);
    this.svg.selectAll("*").remove();

    var timestampBandFill = function (idx) {
      return idx % 2 === 0 ? TIMESTAMP_BAND_EVEN_COLOR : TIMESTAMP_BAND_ODD_COLOR;
    };

    var timestampBands = this.svg
      .selectAll("rect.timestamp-band")
      .data(timestamps)
      .enter()
      .append("rect")
      .attr("class", "timestamp-band")
      .attr("x", 0)
      .attr("y", function (d) {
        return rowByTimestamp[d] * TIMESTAMP_HEIGHT;
      })
      .attr("width", chartWidth)
      .attr("height", TIMESTAMP_HEIGHT)
      .attr("fill", function (d, idx) {
        return timestampBandFill(idx);
      });

    var leafCount = Math.max(currentX, 1);
    var innerWidth = Math.max(1, chartWidth - 2 * HORIZONTAL_MARGIN);
    var cellWidth = Math.floor(
      Math.min(
        MAX_CELL_RECT_WIDTH,
        leafCount > 0
          ? (innerWidth - (leafCount + 1) * CELL_SPACING) / leafCount
          : innerWidth
      )
    );
    if (!isFinite(cellWidth) || cellWidth < 8) {
      cellWidth = Math.min(MAX_CELL_RECT_WIDTH, Math.max(8, Math.floor(innerWidth / 4)));
    }
    cellWidth = Math.min(cellWidth, innerWidth);

    var domainMax = Math.max(leafCount - 1, 0);
    var minCenterX = HORIZONTAL_MARGIN + cellWidth / 2;
    var maxCenterX = chartWidth - HORIZONTAL_MARGIN - cellWidth / 2;
    var scaleX = function (unitX) {
      if (maxCenterX <= minCenterX) {
        return chartWidth / 2;
      }
      if (domainMax === 0) {
        return (minCenterX + maxCenterX) / 2;
      }
      return minCenterX + (unitX / domainMax) * (maxCenterX - minCenterX);
    };

    var chartCells = ids.map(
      function (id) {
        return this.cells[id];
      }.bind(this)
    );

    var linkData = [];
    for (var p = 0; p < chartCells.length; p += 1) {
      var parentCell = chartCells[p];
      if (parentCell.child0) {
        linkData.push({ parent: parentCell, child: parentCell.child0 });
      }
      if (parentCell.child1) {
        linkData.push({ parent: parentCell, child: parentCell.child1 });
      }
    }

    var cellTopY = function (lineageCell) {
      return (
        rowByTimestamp[lineageCell.timestamp] * TIMESTAMP_HEIGHT +
        (TIMESTAMP_HEIGHT - CELL_HEIGHT) / 2
      );
    };

    this.svg
      .selectAll("line.lineage-link")
      .data(linkData)
      .enter()
      .append("line")
      .attr("class", "lineage-link")
      .attr("x1", function (d) {
        return scaleX(d.parent.x);
      })
      .attr("y1", function (d) {
        return cellTopY(d.parent) + CELL_HEIGHT;
      })
      .attr("x2", function (d) {
        return scaleX(d.child.x);
      })
      .attr("y2", function (d) {
        return cellTopY(d.child);
      })
      .attr("stroke", LINK_STROKE_COLOR)
      .attr("stroke-width", 2);

    var self = this;
    this.svg
      .selectAll("rect.lineage-cell")
      .data(chartCells)
      .enter()
      .append("rect")
      .attr("class", "lineage-cell")
      .attr("x", function (d) {
        return scaleX(d.x) - cellWidth / 2;
      })
      .attr("y", function (d) {
        return cellTopY(d);
      })
      .attr("width", cellWidth)
      .attr("height", CELL_HEIGHT)
      .attr("fill", function (d) {
        return d.color;
      })
      .attr("stroke", CELL_STROKE_COLOR)
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        timestampBands.attr("fill", function (timestamp, idx) {
          return timestamp === d.timestamp ? TIMESTAMP_BAND_HOVER_COLOR : timestampBandFill(idx);
        });
        self.tooltip
          .style("opacity", 1)
          .text("t=" + d.timestamp + " id=" + d.identityString);
      })
      .on("mousemove", function (event) {
        var rect = self.container.getBoundingClientRect();
        self.tooltip
          .style("left", event.clientX - rect.left + 8 + "px")
          .style("top", event.clientY - rect.top + 8 + "px");
      })
      .on("mouseout", function () {
        timestampBands.attr("fill", function (timestamp, idx) {
          return timestampBandFill(idx);
        });
        self.tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        if (typeof self.clickCallback === "function") {
          self.clickCallback(d.timestamp, d.identityString);
        }
      });

    return this;
  };

  return {
    LineageChart: LineageChart,
    LineageCell: LineageCell
  };
});
