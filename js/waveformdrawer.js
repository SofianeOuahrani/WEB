// ABOUT HOW TO DRAW AND ANIMATE IN AN HTML CANVAS
// You can follow the MOOC "HTML Coding Essentials and Best Practices" 
// at W3cx.org, by Michel Buffa, Modules 3 and 4 (drawing and animation)
// https://www.edx.org/learn/html5/the-world-wide-web-consortium-w3c-html5-coding-essentials-and-best-practices

// A class for drawing a waveform in a canvas
// It needs the decoded audio buffer and a canvas
// It builds an array of peaks for drawing the waveform
// The sampleStep parameter is optional, it is used to speed up the computation of the peaks
// by skipping samples. If not provided, it will be set to a tenth of sampleSize in getPeaks()
// sampleSize is the number of samples used to compute a single peak
// see getPeaks() method for more details
export default class WaveformDrawer {
    decodedAudioBuffer;
    peaks;
    canvas;
    displayWidth;
    displayHeight;
    sampleStep;

    init(decodedAudioBuffer, canvas, color, sampleStep) {
        this.decodedAudioBuffer = decodedAudioBuffer;
        this.canvas = canvas;
        this.displayWidth = canvas.width;
        this.displayHeight = canvas.height;
        this.color = color;
        // sampleStep can be undefined if not provided as parameter, in that case, the getPeaks()
        // method will define it as a tenth of sampleSize
        this.sampleStep = sampleStep;

        // Initialize the peaks array from the decoded audio buffer and canvas size
        this.getPeaks();
    }

    max(values) {
        let max = -Infinity;
        for (let i = 0, len = values.length; i < len; i++) {
            let val = values[i];
            if (val > max) { max = val; }
        }
        return max;
    }
    // Fist parameter : where to start vertically in the canvas (useful when we draw several
    // waveforms in a single canvas)
    // Second parameter = height of the sample
    drawWave(startY, height) {
        let ctx = this.canvas.getContext('2d');
        ctx.save();
        // start drawing at startY
        ctx.translate(0, startY);

        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;

        let width = this.displayWidth;
        // Compute the coefficient for scaling the peaks (values between -1 and 1)
        // after this conversion, the peaks will be between -height/2 and height/2
        let coef = height / (2 * this.max(this.peaks));

        let halfH = height / 2;

        // draw a horizontal line at half height
        ctx.beginPath();
        ctx.moveTo(0, halfH);
        ctx.lineTo(width, halfH);
        console.log("drawing from 0, " + halfH + " to " + width + ", " + halfH);
        ctx.stroke();


        //  draw the waveform
        ctx.beginPath();
        ctx.moveTo(0, halfH);

        // first draw the upper part of the waveform
        for (let i = 0; i < width; i++) {
            let h = Math.round(this.peaks[i] * coef);
            ctx.lineTo(i, halfH + h);
        }
        ctx.lineTo(width, halfH);

        // then draw the lower part of the waveform
        ctx.moveTo(0, halfH);

        for (let i = 0; i < width; i++) {
            let h = Math.round(this.peaks[i] * coef);
            ctx.lineTo(i, halfH - h);
        }

        ctx.lineTo(width, halfH);

        ctx.fill();

        ctx.restore();
    }

    // Builds an array of peaks for drawing
    // Need the decoded buffer
    // Note that we go first through all the sample data and then
    // compute the value for a given column in the canvas, not the reverse
    // A sampleStep value is used in order not to look each indivudal sample
    // value as they are about 15 millions of samples in a 3mn song !
    getPeaks() {
        let buffer = this.decodedAudioBuffer;
        // size of the block of samples that will be used to compute a single peak
        let sampleSize = Math.ceil(buffer.length / this.displayWidth);

        console.log("sample size = " + buffer.length);

        // Check is sampleStep is defined, if not define it as a tenth of sampleSize
        // ~~ is equivalent to Math.floor FOR POSITIVE VALUES ONLY, this is a trick to avoid using Math.floor()
        // is the bit operator for "NOT", so ~~ is like applying NOT twice. It removes the decimal part of a number
        // converted to a 32 bit integer. ~~x is equivalent to toInt32(x).
        // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#examples
        // Note : ~~4.9 is equal to 4 and ~~-4.9 is equal to -4
        // But Math.floor(-4.9) is -5
        // So be careful, here sampleSize is always positive so we can use ~~
        this.sampleStep = this.sampleStep || ~~(sampleSize / 10);

        // is this.sampleStep is 0, set it to 1
        if (this.sampleStep < 1) {
            this.sampleStep = 1;
        }
        
        // An audio sample can be stereo or mono, we average the peaks of each channel
        let channels = buffer.numberOfChannels;

        // The result is an array of size equal to the displayWidth
        this.peaks = new Float32Array(this.displayWidth);

        // For each channel
        for (let c = 0; c < channels; c++) {
            // get the sample data for this channel
            // a channel sample data is a Float32Array with values between -1 and 1
            let chan = buffer.getChannelData(c);

            // For each column in the canvas
            for (let i = 0; i < this.displayWidth; i++) {
                // compute the start and end of the block of samples that will
                // be used to compute the peak for this column
                let start = ~~(i * sampleSize);
                let end = start + sampleSize;
                // find the peak in this block of samples
                // the peak is the maximum of the absolute values of the samples
                let peak = 0;
                for (let j = start; j < end; j += this.sampleStep) {
                    let value = chan[j];
                    if (value > peak) {
                        peak = value;
                    } else if (-value > peak) {
                        peak = -value;
                    }
                }
                if (c > 1) {
                    this.peaks[i] += peak / channels;
                } else {
                    this.peaks[i] = peak / channels;
                }
            }
        }
    }
}


