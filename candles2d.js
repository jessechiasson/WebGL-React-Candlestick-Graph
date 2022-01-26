import React, {Component} from 'react'
import {withRouter} from 'react-router-dom'

import '../static/candle2d.css';

import * as d3 from "d3";
import * as fc from "d3fc";
import * as d3_annotations from "d3-svg-annotation";


const trunc = (str, len) =>
  str.length > len ? str.substr(0, len - 1) + "..." : str;

const distance = (x1, y1, x2, y2) => {
  const dx = x1 - x2,
    dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
};

const hashCode = s =>
  s.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

const webglColor = color => {
  const { r, g, b, opacity } = d3.color(color).rgb();
  return [r / 255, g / 255, b / 255, opacity];
};

const iterateElements = (selector, fn) => {
  [].forEach.call(document.querySelectorAll(selector), fn);
}

function minimum(data, accessor) {
    return data.map(function(dataPoint, index) {
        return [accessor(dataPoint, index), dataPoint, index];
    }).reduce(function(accumulator, dataPoint) {
        return accumulator[0] > dataPoint[0] ? dataPoint : accumulator;
    }, [Number.MAX_VALUE, null, -1]);
}
  
function snap(series, data, point) { 
        if (point == undefined) return []; // short circuit if data point was empty
        var xScale = series.xScale(),
            xValue = series.crossValue();
        
        var filtered = data.filter((d) => (xValue(d) != null));
        var nearest = minimum(filtered, (d) => Math.abs(point.x - xScale(xValue(d))))[1]; 

        return [{
            x: xScale(xValue(nearest)),
            y: point.y 
        }];
};

function toTimestamp(strDate) {
  var datum = Date.parse(strDate);
  return datum;// /1000;
}

function addDayTimestamp(strDate, k) {
  var datum = Date.parse(strDate);
  return datum + (k * 86400000);
}

function addDayDatestring(strDate, k) {
  var t = addDayTimestamp(strDate, k)
  var d = toDateString(t);
  return d;
}

function toDateString(timestamp) {
  var date = new Date(timestamp)
  var day = date.toLocaleString("en-US", {day: "numeric"}) // 9
  var month = date.toLocaleString("en-US", {month: "numeric"}) // 9
  var year = date.toLocaleString("en-US", {year: "numeric"}) // 9

  if (month.length == 1) { month = `0${month}` }
  if (day.length == 1) { day = `0${day}`}  

  return `${year}-${month}-${day}`
}

function toDatetimeString(timestamp) {
  var date = new Date(timestamp)

  var second = "00"
  var minute = date.toLocaleString("en-US", {minute: "numeric"})
  var hour = date.toLocaleString("en-US", {hour12: false, hour:"numeric"})
  var day = date.toLocaleString("en-US", {day: "numeric"}) 
  var month = date.toLocaleString("en-US", {month: "numeric"}) 
  var year = date.toLocaleString("en-US", {year: "numeric"})
  
  if (minute.length == 1) { minute = `0${minute}`}
  if (hour.length == 1) { hour = `0${hour}`}
  if (day.length == 1) { day = `0${day}`}  
  if (month.length == 1) { month = `0${month}` }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

class Candles2d extends Component {
    constructor(props) {
      super (props);        

        this.stock_ticker = props.stock_ticker;
        this.stock_company_name = props.stock_company_name;
        this.current_value = props.data_x[props.data_x.length-1];
        this.current_timeframe = props.current_timeframe;
        this.current_stock_price = props.current_stock_price;
        this.ols_data = props.ols_data;
        this.ols_slope = props.ols_slope;
        this.ols_intercept = props.ols_intercept;
        this.data_length = props.data_length;
        this.toggle_alt_input_c = props.toggle_alt_input_c
        this.start_date_string = toDateString(props.start_date)
        this.end_date_string = toDateString(props.start_end)
        this.toggle_crosshair = props.show_crosshair
        this.set_new = 1;
        this.chart_type = "candle"

        this.state = ({
            old_height: 0,
            old_width: 0,
            x_label: "x",
            plot_width: props.scene_width,
            plot_height: props.scene_height,
            current_value: 0,
            data_x_min: props.array_dates[0],
            data_x_max: props.array_dates[5000],
            data_y_min: 0,
            data_y_max: 1000,

            dot_color: [0.0, 0.0, 0.0, 0.7],
            plot_color: "#ffffff",
            zeroline_color: "#000000",
            gridline_color: "#000000",
            label_color: "#000000",

            currentvalue_width: "4px",
            zeroline_width: "4px",
            gridline_width: 0,

            toggle_currentvalue: true,
            toggle_gridlines: true,
            toggle_zerolines: true,  

        })

        this.xScale = d3.scaleLinear().domain([this.state.data_x_min, this.state.data_x_max]);   
        this.yScale = d3.scaleLinear().domain([this.state.data_y_min, this.state.data_y_max]);

        this.xScaleOriginal = this.xScale.copy();
        this.yScaleOriginal = this.yScale.copy();

        this.dragY = d3.drag()
        this.dragX = d3.drag()
    
	this.lastY = t.y;
        this.lastX = t.x;
        this.lastK = t.k;

        this.count = 0;

        this.crosshair_data = [{x:0,y:0}]
        this.rect_coords = [0,0]
        
    }

    packager = (dates, closes, highs, lows, opens) => {

      let plot_data = [];

      for (var i=0; i < dates.length; i++) {

        if (dates[i] !== NaN) {        
            plot_data.push({
                index: i,
                date: toDatetimeString(toTimestamp(dates[i])),
                open: Number(opens[i]),
                high: Number(highs[i]),
                low: Number(lows[i]),
                close: Number(closes[i]),
            });
        }        
      }

      return plot_data;
    }
    
    setup_labels = (ticker, company, points, label_size, toggle_watermark) => {

      var margin = {top: 20, right: 80, bottom: 30, left: 50}

      var svg = d3
      .select("d3fc-svg")
      .select("svg")      

      //svg
      //.append("g")
      //.attr("class","xlabel")
      //.append("text")
      //.style("text-anchor", "start")
      //.text("Date")
      //.style("font-size", this.label_size + "px");
      
      //svg
      //.append("g")
      //.attr("class","ylabel")
      //.append("text")
      //.style("text-anchor", "end")
      //.text("Price")
      //.style("font-size", this.label_size + "px");

      let info = svg
      .append("g")
      .attr("class","info")
      
      info
      .append("text")
      .attr("class","stock_name")
      .style("text-anchor", "start")
      .style("color","rgba(0, 255, 255, 1)")
      .text(`${this.state.stock_ticker} - ${this.state.stock_company_name}` )

      info.append("text")
      .attr("class","stock_group")
      .attr('x', 0)
      .attr('dy', 22)            
      .text(`${this.state.stock_sector} - ${this.state.stock_industry}`)

      info.append("text")
      .attr("class","stock_current")     
      .attr('x', 0)
      .attr('dy', 44)
      .text(`${this.current_timeframe} - $${this.current_stock_price}`)  
      
      info.append("text")
      .attr("class","levels")
      .attr("x", 0)
      .attr("y", 66)
      .text(`O:${this.candle_data[this.dlen-1].open} H:${this.candle_data[this.dlen-1].high} L:${this.candle_data[this.dlen-1].low} C:${this.candle_data[this.dlen-1].close}`)

      // info.append("text")
      // .attr("class","date_range")
      // .attr("x",0)
      // .attr('dy', 154)
      // .text(`Date Range: ${this.start_date_string} - ${this.end_date_string}`)

      let watermark = svg
      .append("g")
      .attr("class","watermark")
      .style("display", toggle_watermark ? "initial" : "none")

      watermark
      .append("text")
      .attr("class","watermark_title")
      .text(`${this.stock_ticker}`)      

      watermark
      .append("text")
      .attr("class","watermark_sub")
      .attr('x', -5)
      .attr('dy', 60)  
      .text(`${this.stock_company_name}`)  
    

    }
    
    remove_weekends = (array) => {
        
        var current_weekday;
        var new_array = [];

        for (var i=0; i<array.length; i++) {            
            current_weekday = new Date(array[i]).getDay()
            if (current_weekday != 0 && current_weekday != 6) { new_array.push(array[i]) }
            else{ new_array.push(NaN); console.log("NaN")}
        }
        return new_array;
    }

    recent_y_range = (lows, highs, period) => {

        var low_low = lows[lows.length-1]
        var high_high = highs[highs.length-1]
        
        
        for (var i=0; i<period; i++) {
            if (lows[lows.length-1-i] < low_low) { low_low = lows[lows.length-1-i]}
            if (highs[highs.length-1-i] > high_high) { high_high = highs[highs.length-1-i]}
        }

        return [low_low, high_high]
    }
    
    componentWillReceiveProps(nextProps) {

        this.chart_type = nextProps.chart_type


        this.array_dates = nextProps.array_dates

        this.candle_data = nextProps.bar_data

        this.dlen = this.candle_data.length

        this.toggle_crosshair = nextProps.show_crosshair

        this.price_lows = Object.keys(this.candle_data).map((key) => { return this.candle_data[key].low })
        this.price_highs = Object.keys(this.candle_data).map((key) => { return this.candle_data[key].high })   

        if (nextProps.set_new != this.set_new && nextProps.bar_data.length != 0) {  

          var period = 200; 

          var y_range = this.recent_y_range(this.price_lows, this.price_highs, period)

          this.xExtent = fc.extentLinear().accessors([d => d.index])
          this.yExtent = fc.extentLinear().accessors([d => d.close])
          
          this.xScale.domain(this.xExtent(this.candle_data));
          this.yScale.domain(this.yExtent(this.candle_data));

          this.xScale.domain([this.candle_data.length-period, this.candle_data.length ]).ticks(12)
          this.yScale.domain([y_range[0], y_range[1]]).ticks(12);

          this.xScaleOriginal = this.xScale.copy();
          this.yScaleOriginal = this.yScale.copy();

          this.setState({
            x_label: nextProps.x_label, 
            plot_width: nextProps.scene_width,
            plot_height: nextProps.scene_height,
            
            }, () => {
            this.redraw()
          })

          this.set_new = nextProps.set_new;

        }           

        this.xScale.ticks(12);
        this.yScale.ticks(12);


        this.dragX = d3.drag()
        .on('drag', (event) => {
          const factor = Math.pow(2, -event.dx * 0.01);
          this.zoomID = "x";
          d3.select('#chart .plot-area').call(this.zoom.scaleBy, factor);                     
        });  

        this.dragY = d3.drag()
        .on('drag', (event) => {
          const factor = Math.pow(2, -event.dy * 0.01);
          this.zoomID = "y";
          d3.select('#chart .plot-area').call(this.zoom.scaleBy, factor);
        });
              

        const currentvalue_width = this.state.currentvalue_width
        const zeroline_width = this.state.zeroline_width
        
        var current_value = [{value: this.current_value, class: 'current_line'}]
        var zeroline = [{value: 0, class: 'zeroline'}]


        var gridlines = fc.annotationSvgGridline()

        const margin = {top: 15, right: 65, bottom: 205, left: 50},
        w = 1000 - margin.left - margin.right,
        h = 625 - margin.top - margin.bottom;

        const format = d3.format('.2f');

        this.crosshair = fc
        .annotationSvgCrosshair()
        .xScale(this.xScale)
        .yScale(this.yScale)
        //.xLabel(d => format(this.xScale.invert(d.x)))
        //.xLabel(d => format(this.xScale(d.x)))
        //.yLabel(d => format(this.yScale.invert(d.y)))
        .decorate(sel => {
            sel.selectAll('.point>path').attr('transform', 'scale(0)');
            sel
            .style('stroke','#00ff00')
            .style('stroke-width', "3px")
            .style('stroke-dasharray','3, 3')            
        });

        const fillColor = fc
        .webglFillColor()
        .data(this.candle_data)
        .value(d => 
            d.close > d.open ? 
                [0, 1, 0.55, 1] : [1, 0, 0.3, 1]
        );

        this.lineSeries = 
        fc.seriesWebglLine()
        .mainValue(d => d.close)
        .crossValue(d => d.index)          
        .lineWidth(3);

        this.candleSeries = 
        fc.seriesWebglCandlestick()
        .crossValue(d => d.index)
        //.xScale(this.xScale)
        //.yScale(this.yScale)
        //.defined(() => true)
        .openValue(d => d.open)
			  .highValue(d => d.high)
			  .lowValue(d => d.low)
			  .closeValue(d => d.close)
        .decorate(program => {
          fillColor(program)
            program
                .vertexShader()
                .appendHeader('attribute vec4 aFillColor;')
                .appendHeader('varying vec4 vFillColor;')
                .appendBody('vFillColor = aFillColor;');
            program
                .fragmentShader()
                .appendHeader('varying vec4 vFillColor;')
                .appendBody('gl_FragColor = vFillColor;');
            program
                .buffers()
                .attribute('aFillColor', [0, 0, 1, 1]);
         });

        


        const container = document.querySelector('d3fc-svg');
        const svg = d3.select(container).select('svg');

        var series; 
        this.chart_type == "candle" ? series = this.candleSeries : series = this.lineSeries;

        this.chart = fc
          .chartCartesian(this.xScale, this.yScale)
          .yOrient("right")
          .svgPlotArea(
            fc     
            .seriesSvgMulti()
            .series([gridlines])              
          )
          .webglPlotArea(
            fc     
            .seriesWebglMulti()
            .series([series])
            .mapping(d => d.data)
          )
          .xTickFormat((index, i) => {

            if (i<this.dlen && i>0){
              try{
                return this.candle_data[index].date
              }
              catch {
                return ''
              }
            } 
            else {return ''}
          })
          .yDecorate((sel_y, d) => {
            d3.select('#chart')
              .select('.y-axis')
              .call(this.dragY)
              .attr("pointer-events", "none")
          })
          .xDecorate((sel_x, d) => {
            d3.select('#chart')
              .select('.x-axis')
              .call(this.dragX)
              .attr("pointer-events", "none")
          })
          .decorate(sel => {
            sel
            .enter()
            .select("d3fc-svg.plot-area")
            .on("measure.range", (event) => {
                let detail = event.detail;

                this.xScaleOriginal.range([0, detail.width]);
                this.yScaleOriginal.range([detail.height, 0]);
            })
            .on("draw", () => {                
                var crosshair_data = this.crosshair_data
                svg.datum(crosshair_data).call(this.crosshair)
            })
            .call(this.zoom)
            }
          );
       

        var bbb = d3.select('.info')       
        var bb = bbb._groups[0][0]

        if (bb === null) { this.setup_labels(nextProps.current_asset, '', 0, '', nextProps.toggle_watermark); }  

        d3.select("d3fc-svg").select("svg").selectAll(".multi").selectAll("g").selectAll(".gridline-y").style("display",nextProps.show_gridlines ? "initial" : "none");
        d3.select("d3fc-svg").select("svg").selectAll(".multi").selectAll("g").selectAll(".gridline-x").style("display",nextProps.show_gridlines ? "initial" : "none");
                  
        d3.select("d3fc-svg").select("svg").select(".watermark").style("display", nextProps.toggle_watermark ? "initial" : "none")
        d3.select("d3fc-svg").select("svg").select(".watermark").select(".watermark_title").select("text").text(`${nextProps.stock_ticker}`)
        d3.select("d3fc-svg").select("svg").select(".watermark").select(".watermark_sub").select("text").text(`${nextProps.stock_company_name}`)
      
        d3.select("d3fc-svg").select("svg").select(".info").style("display", nextProps.show_graph_info ? "initial" : "none")
        d3.select("d3fc-svg").select("svg").select(".info").select(".stock_name").text(`${nextProps.stock_ticker}: ${nextProps.stock_company_name}`)
        d3.select("d3fc-svg").select("svg").select(".info").select(".stock_group").text(`${nextProps.stock_sector} - ${nextProps.stock_industry}`)        
        d3.select("d3fc-svg").select("svg").select(".info").select(".stock_current").text(`${this.current_timeframe} - $${this.current_stock_price}`)  
        d3.select("d3fc-svg").select("svg").select(".info").select(".date_range").text(`Date Range: ${this.start_date_string} - ${this.end_date_string}`)
        
        console.log("received")
        
        this.redraw();

    }


    componentDidMount() {

        console.log('plot component mounted'); 

        document.getElementById("#chart")

        this.candle_data = [{date:this.state.data_x_min, open:0, high:0, low:0, close:0},{date:this.state.data_x_max, open:1000, high:1000, low:1000, close:1000}]

        const container = document.querySelector('d3fc-svg');
        const svg = d3.select(container).select('svg');

        const format = d3.format('.2f');

        this.crosshair = fc
        .annotationSvgCrosshair()
        .xScale(this.xScale)
        .yScale(this.yScale)
        .xLabel(d => format(this.xScale.invert(d.x)))
        .yLabel(d => format(this.yScale.invert(d.close)))
        .decorate(sel => {
            sel.selectAll('.point>path').attr('transform', 'scale(0)');
            sel
            .style('stroke','#00ff00')
            .style('stroke-width', "4px")
            .style('stroke-dasharray','3, 3')            
        }); 
	    
	d3.zoom()        
        .on("zoom", (event) => {                
            
            // ZOOMING 
            if (event.sourceEvent && event.sourceEvent.type == "wheel") {

              let domainX = this.xScale.domain();      
              let linearX = d3.scaleLinear().domain(this.xScale.range()).range([0, domainX[0] - domainX[1]]);
              let deltaX = linearX((t.x - this.lastX))///t.k);   

              let domainY = this.yScale.domain();
              let linearY = d3.scaleLinear().domain(this.yScale.range()).range([domainY[1] - domainY[0], 0]);
              let deltaY = linearY((t.y - this.lastY)/t.k);
              
              this.xScale.domain([domainX[0] + deltaX, domainX[1] - deltaX]);                     
              this.yScale.domain([domainY[0] - deltaY, domainY[1] + deltaY]);  

            }
            
            // PANNING
            if (event.sourceEvent && event.sourceEvent.type != "wheel") {
    
              let domainX = this.xScale.domain();      
              let linearX = d3.scaleLinear().domain(this.xScale.range()).range([0, domainX[0] - domainX[1]]);       
              let deltaX = linearX(t.x - this.lastX);
              this.xScale.domain([domainX[0] + deltaX, domainX[1] + deltaX]);      
                            
              let domainY = this.yScale.domain();
              let linearY = d3.scaleLinear().domain(this.yScale.range()).range([domainY[1] - domainY[0], 0]);   
              let deltaY = linearY(t.y - this.lastY)
              this.yScale.domain([domainY[0] + deltaY, domainY[1] + deltaY]);
                                                
            }
            this.lastY = t.y;
            this.lastX = t.x;
            this.lastK = t.k;           
                    
            this.redraw();                   
                      
        })

        const xAxis = d3.axisBottom(this.xScale).tickFormat('').ticks(12);
        const yAxis = d3.axisRight(this.yScale).tickFormat('').ticks(12);

        const xAxisJoin = fc.dataJoin('g', 'x-axis');
        const yAxisJoin = fc.dataJoin('g', 'y-axis');

        this.fillColorAttribute = 
        fc.webglFillColor() 
        .data(this.candle_data) 
        .value(d => d.close > d.open ? [0, 0, 1, 1] : [1, 0, 0, 1] )


        this.candleSeries = 
        fc.seriesWebglCandlestick()
        .xScale(this.xScale)
        .yScale(this.yScale)
        .defined(() => true)
        .openValue(d => d.open)
        .highValue(d => d.high)
        .lowValue(d => d.low)
        .closeValue(d => d.close)
        .decorate(program => {
          program
              .vertexShader()
              .appendHeader('attribute vec4 aFillColor;')
              .appendHeader('varying vec4 vFillColor;')
              .appendBody('vFillColor = aFillColor;');
          program
              .fragmentShader()
              .appendHeader('varying vec4 vFillColor;')
              .appendBody('gl_FragColor = vFillColor;');
          program
              .buffers()
              //.attribute('aFillColor', this.fillColorAttribute);
        });

        this.lineSeries = fc
          .seriesWebglLine()
          .mainValue(d => d.close)
          .crossValue(d => d.date)          
          .lineWidth(3);

        this.chart = fc
          .chartCartesian(this.xScale, this.yScale)
          .yOrient("right")
          .svgPlotArea(
            fc
            .seriesSvgMulti().series([this.crosshair])
          )
          .webglPlotArea(
            fc     
            .seriesWebglMulti().series([this.candleSeries])
          )
          .decorate(sel =>
            sel
            .enter()
            .select("d3fc-svg.plot-area")
            .on("measure.range", (event) => {
                let detail = event.detail;

                this.xScaleOriginal.range([0, detail.width]);
                this.yScaleOriginal.range([detail.height, 0]);

                const { width } = event.detail;
                this.candleSeries.bandwidth(width / 250);
            })
            .on('mousemove', (event, d) => {                
                var coords0 = d3.pointer( event ); 
                var coords = [event.offsetX, event.offsetY];

                var bisectDate = d3.bisector(function(d) { return d.index; }).left
                var x0 = this.xScale.invert(coords0[0]);
                var i = bisectDate(d.data, x0, 1)
                var d0 = d.data[i-1]
                var d1 = d.data[i]
                var xx = this.xScale(coords[0]);
                var yy = this.yScale(coords[1]);

                var y = this.yScale.invert(yy);
                var x = this.xScale.invert(xx);

                if (!d1) { d1 = d.data[this.dlen-1] }

                d3.select("d3fc-svg").select("svg").select(".info").select(".levels").text(`O:${d1.open} H:${d1.high} L:${d1.low} C:${d1.close}`) 
                
                d3.select('d3fc-svg.bottom-axis').select("svg").select("rect").attr("transform","translate(" + (x-25)  + "," + 0 + ")")
                d3.select('d3fc-svg.right-axis').select("svg").select("rect").attr("transform","translate(" + 0 + "," + (y-15) + ")")

                this.rect_coords = [x,y]
                this.crosshair_data[0] = {x:coords[0], y:coords[1]} 
          

                d3.select("d3fc-svg").select("svg").select(".annotation-crosshair").selectAll("g").selectAll("g").selectAll("g").style('stroke-width', this.toggle_crosshair ?"4px" : "0px")

                var crosshair_data = this.crosshair_data
                const container = document.querySelector('d3fc-svg');
                const svg = d3.select(container).select('svg');
                svg.datum(crosshair_data).call(this.crosshair)


            })
            .on('measure', event => {
                const { width, height } = event.detail;
                this.xScale.range([10, width - 30]);
                this.yScale.range([5, height - 20]);
                xAxisJoin(svg, d => [d])
                    .attr('transform', `translate(0, ${height - 20})`)
                    .call(xAxis);
                yAxisJoin(svg, d => [d])
                    .attr('transform', `translate(${width - 30}, 0)`)
                    .call(yAxis);
            }) 
            .on("zoom", (event) => {
              console.log(">>>>", event)
            })
            .call(this.zoom)
          
        );   
        

        this.redraw();

    }


    componentDidUpdate() {
      this.redraw();        
    }
  
    componentWillUnmount() {
  
        window.removeEventListener('resize', this.handle_resize);
     
    }

    redraw = () => {

        var data = this.candle_data
        d3.select("#chart").datum({ data }).call(this.chart)
        
        if (document.querySelector('#xaxis_rect')==null) {
		
	  // CROSSHAIR
          var xaxis = d3
          .select("d3fc-svg.bottom-axis")
          .select("svg")
          .attr("id","xaxis_svg")
          .append("rect")  
          .attr("id","xaxis_rect")  
          .attr("height","100%")
          .attr("width","50px") 
          .attr("dx",this.rect_coords[0])
          .attr("fill","#ff0000")
          .append("g")
          .attr("class","x_tooltip")

          var yaxis = d3
          .select("d3fc-svg.right-axis")
          .select("svg")
          .attr("id","yaxis_svg")
          .append("rect")  
          .attr("id","yaxis_rect")  
          .attr("height","30px")
          .attr("width","50px") 
          .attr("dy",this.rect_coords[1])
          .attr("fill","#ff0000")
          .append("g")
          .attr("class","y_tooltip")
        }

        

    };

    handle_resize = () => {
      
        const width = this.state.scene_width;
        const height = this.state.scene_height;

    }


    render() {
        return(

            <div id="chart-container" >
                <div id="chart"></div>
            </div>
   
        )
    }
}

export default withRouter(Candles2d);
