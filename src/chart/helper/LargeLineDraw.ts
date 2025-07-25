/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

// TODO Batch by color

import * as graphic from '../../util/graphic';
import * as lineContain from 'zrender/src/contain/line';
import * as quadraticContain from 'zrender/src/contain/quadratic';
import { PathProps } from 'zrender/src/graphic/Path';
import SeriesData from '../../data/SeriesData';
import { StageHandlerProgressParams, LineStyleOption, ColorString } from '../../util/types';
import Model from '../../model/Model';
import { getECData } from '../../util/innerStore';
import Element from 'zrender/src/Element';
import tokens from '../../visual/tokens';

class LargeLinesPathShape {
    polyline = false;
    curveness = 0;
    segs: ArrayLike<number> = [];
}

interface LargeLinesPathProps extends PathProps {
    shape?: Partial<LargeLinesPathShape>
}

interface LargeLinesCommonOption {
    polyline?: boolean
    lineStyle?: LineStyleOption & {
        curveness?: number
    }
}

/**
 * Data which can support large lines.
 */
type LargeLinesData = SeriesData<Model<LargeLinesCommonOption> & {
    seriesIndex?: number
}>;

class LargeLinesPath extends graphic.Path {
    shape: LargeLinesPathShape;

    __startIndex: number;
    private _off: number = 0;

    hoverDataIdx: number = -1;

    notClear: boolean;

    constructor(opts?: LargeLinesPathProps) {
        super(opts);
    }

    reset() {
        this.notClear = false;
        this._off = 0;
    }

    getDefaultStyle() {
        return {
            stroke: tokens.color.neutral99,
            fill: null as ColorString
        };
    }

    getDefaultShape() {
        return new LargeLinesPathShape();
    }

    buildPath(ctx: CanvasRenderingContext2D, shape: LargeLinesPathShape) {
        const segs = shape.segs;
        const curveness = shape.curveness;
        let i;

        if (shape.polyline) {
            for (i = this._off; i < segs.length;) {
                const count = segs[i++];
                if (count > 0) {
                    ctx.moveTo(segs[i++], segs[i++]);
                    for (let k = 1; k < count; k++) {
                        ctx.lineTo(segs[i++], segs[i++]);
                    }
                }
            }
        }
        else {
            for (i = this._off; i < segs.length;) {
                const x0 = segs[i++];
                const y0 = segs[i++];
                const x1 = segs[i++];
                const y1 = segs[i++];
                ctx.moveTo(x0, y0);
                if (curveness > 0) {
                    const x2 = (x0 + x1) / 2 - (y0 - y1) * curveness;
                    const y2 = (y0 + y1) / 2 - (x1 - x0) * curveness;
                    ctx.quadraticCurveTo(x2, y2, x1, y1);
                }
                else {
                    ctx.lineTo(x1, y1);
                }
            }
        }
        if (this.incremental) {
            this._off = i;
            this.notClear = true;
        }
    }

    findDataIndex(x: number, y: number) {

        const shape = this.shape;
        const segs = shape.segs;
        const curveness = shape.curveness;
        const lineWidth = this.style.lineWidth;

        if (shape.polyline) {
            let dataIndex = 0;
            for (let i = 0; i < segs.length;) {
                const count = segs[i++];
                if (count > 0) {
                    const x0 = segs[i++];
                    const y0 = segs[i++];
                    for (let k = 1; k < count; k++) {
                        const x1 = segs[i++];
                        const y1 = segs[i++];
                        if (lineContain.containStroke(x0, y0, x1, y1, lineWidth, x, y)) {
                            return dataIndex;
                        }
                    }
                }

                dataIndex++;
            }
        }
        else {
            let dataIndex = 0;
            for (let i = 0; i < segs.length;) {
                const x0 = segs[i++];
                const y0 = segs[i++];
                const x1 = segs[i++];
                const y1 = segs[i++];
                if (curveness > 0) {
                    const x2 = (x0 + x1) / 2 - (y0 - y1) * curveness;
                    const y2 = (y0 + y1) / 2 - (x1 - x0) * curveness;

                    if (quadraticContain.containStroke(
                        x0, y0, x2, y2, x1, y1, lineWidth, x, y
                    )) {
                        return dataIndex;
                    }
                }
                else {
                    if (lineContain.containStroke(
                        x0, y0, x1, y1, lineWidth, x, y
                    )) {
                        return dataIndex;
                    }
                }

                dataIndex++;
            }
        }

        return -1;
    }

    contain(x: number, y: number): boolean {
        const localPos = this.transformCoordToLocal(x, y);
        const rect = this.getBoundingRect();
        x = localPos[0];
        y = localPos[1];

        if (rect.contain(x, y)) {
            // Cache found data index.
            const dataIdx = this.hoverDataIdx = this.findDataIndex(x, y);
            return dataIdx >= 0;
        }
        this.hoverDataIdx = -1;
        return false;
    }

    getBoundingRect() {
        // Ignore stroke for large symbol draw.
        let rect = this._rect;
        if (!rect) {
            const shape = this.shape;
            const points = shape.segs;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (let i = 0; i < points.length;) {
                const x = points[i++];
                const y = points[i++];
                minX = Math.min(x, minX);
                maxX = Math.max(x, maxX);
                minY = Math.min(y, minY);
                maxY = Math.max(y, maxY);
            }

            rect = this._rect = new graphic.BoundingRect(minX, minY, maxX, maxY);
        }
        return rect;
    }
}

class LargeLineDraw {
    group = new graphic.Group();
    private _newAdded: LargeLinesPath[];
    /**
     * Update symbols draw by new data
     */
    updateData(data: LargeLinesData) {
        this._clear();

        const lineEl = this._create();
        lineEl.setShape({
            segs: data.getLayout('linesPoints')
        });

        this._setCommon(lineEl, data);
    };

    /**
     * @override
     */
    incrementalPrepareUpdate(data: LargeLinesData) {
        this.group.removeAll();
        this._clear();
    };

    /**
     * @override
     */
    incrementalUpdate(taskParams: StageHandlerProgressParams, data: LargeLinesData) {
        const lastAdded = this._newAdded[0];
        const linePoints = data.getLayout('linesPoints');

        const oldSegs = lastAdded && lastAdded.shape.segs;

        // Merging the exists. Each element has 1e4 points.
        // Consider the performance balance between too much elements and too much points in one shape(may affect hover optimization)
        if (oldSegs && oldSegs.length < 2e4) {
            const oldLen = oldSegs.length;
            const newSegs = new Float32Array(oldLen + linePoints.length);
            // Concat two array
            newSegs.set(oldSegs);
            newSegs.set(linePoints, oldLen);
            lastAdded.setShape({
                segs: newSegs
            });
        }
        else {
            // Clear
            this._newAdded = [];

            const lineEl = this._create();
            lineEl.incremental = true;
            lineEl.setShape({
                segs: linePoints
            });
            this._setCommon(lineEl, data);
            lineEl.__startIndex = taskParams.start;
        }
    }

    /**
     * @override
     */
    remove() {
        this._clear();
    }

    eachRendered(cb: (el: Element) => boolean | void) {
        this._newAdded[0] && cb(this._newAdded[0]);
    }

    private _create() {
        const lineEl = new LargeLinesPath({
            cursor: 'default',
            ignoreCoarsePointer: true
        });
        this._newAdded.push(lineEl);
        this.group.add(lineEl);
        return lineEl;
    }


    private _setCommon(lineEl: LargeLinesPath, data: LargeLinesData, isIncremental?: boolean) {
        const hostModel = data.hostModel;

        lineEl.setShape({
            polyline: hostModel.get('polyline'),
            curveness: hostModel.get(['lineStyle', 'curveness'])
        });

        lineEl.useStyle(
            hostModel.getModel('lineStyle').getLineStyle()
        );
        lineEl.style.strokeNoScale = true;

        const style = data.getVisual('style');
        if (style && style.stroke) {
            lineEl.setStyle('stroke', style.stroke);
        }
        lineEl.setStyle('fill', null);

        const ecData = getECData(lineEl);
        // Enable tooltip
        // PENDING May have performance issue when path is extremely large
        ecData.seriesIndex = hostModel.seriesIndex;
        lineEl.on('mousemove', function (e) {
            ecData.dataIndex = null;
            const dataIndex = lineEl.hoverDataIdx;
            if (dataIndex > 0) {
                // Provide dataIndex for tooltip
                ecData.dataIndex = dataIndex + lineEl.__startIndex;
            }
        });
    };

    private _clear() {
        this._newAdded = [];
        this.group.removeAll();
    };


}

export default LargeLineDraw;