/*
Copyright © Tyria3DLibrary project contributors

This file is part of the Tyria 3D Library.

Tyria 3D Library is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Tyria 3D Library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with the Tyria 3D Library. If not, see <http://www.gnu.org/licenses/>.
*/

const GW2File = require("../format/file/GW2File");

/**
 * Base class for data interpretors a.k.a. 'Renderers'
 *
 * Renderers are classes that collect and interpret data from the dat file.
 *
 * A {{#crossLink "LocalReader"}}{{/crossLink}} instance is used for accessing data from the dat.
 *
 * A {{#crossLink "Logger"}}{{/crossLink}} is used for posting progress output or error messages.
 *
 * Most Renderers use one or more
 * {{#crossLink "GW2Chunk"}}GW2Chunks{{/crossLink}}, typed data structures that can be read from
 * {{#crossLink "GW2File"}}GW2Files{{/crossLink}}.
 *
 * The generated data, be it strings, numbers or meshes are put into a value object structure called
 * the 'context'. The context can store data generated by multiple renderers and makes sure each
 * renderer type, or class has it's own value object within the context. This enables one renderer
 * to read data written by another renderer wihtout having to worry about overwriting existing data
 * within the context. Keep in mind that you will have to manually pass and clean the conext object!
 *
 * A clean context object should just be the empty javasript object : {}.
 *
 * When a Renderer is done it will fire the callback and any view interrested in retrieving the generated
 * data from the context can read it using
 * {{#crossLink "T3D/getContextValue:method"}}{{/crossLink}}.
 *
 *
 *
 *
 * @class DataRenderer
 * @constructor
 * @param  {LocalReader} localReader  The LocalReader instance to read data from.
 * @param  {Object} settings     Any settings used by this renderer.
 * @param  {Object} context      Shared value object between renderers.
 * @param  {Logger} logger       The logging class to use for progress, warnings, errors et cetera.
 */
class DataRenderer {
  constructor(localReader, settings, context, logger) {
    /// Just storing parameters
    this.localReader = localReader;
    this.settings = settings;
    if (!settings) {
      settings = {};
    }
    this.context = context;
    this.context[this.constructor.name] = {};

    if (logger) this.logger = logger;
    else this.logger = T3D.Logger;
  }

  /**
   * Gets the output value object for a specified class within the context.
   *
   * @param  {Class} otherClass The class to fetch the output value object for.
   * If not specified the class of this instance will be used.
   * @return {Object}            The output value object for this class within the context.
   */
  getOutput(otherClass) {
    return this.context[otherClass ? otherClass.name : this.constructor.name];
  }

  /**
   * Basic rendering of unknown files. Output fileds generated:
   *
   * - *fileId* The fileId passed in the settings parameter when constructing this instance.
   *
   * - *rawData* An ArrayBuffer containg the infalted binary data of the loaded file.
   *
   * - *rawString* A string representation of the rawData
   *
   * - *image* A value object witht he fields 'width', 'height' and 'data' describing a RGBA bitmap
   * image. Only set if the loaded file was a texture.
   *
   * - *file* A GW2File representation of the loaded file. Only set if the loaded file was a Pack File.
   *
   * @async
   * @param  {Function} callback Fires when renderer is finished, does not take arguments.
   */
  renderAsync(callback) {
    let self = this;

    this.localReader.loadFile(this.settings.id, function(inflatedData) {
      /// Set fileId so callers can identify this VO
      self.getOutput().fileId = self.settings.id;

      /// Share inflated data
      self.getOutput().rawData = inflatedData;

      /// Construct raw string
      let uarr = new Uint8Array(inflatedData);
      let rawStrings = [];
      let chunksize = 0xffff;
      let len = Math.min(uarr.length, 10000);

      // There is a maximum stack size. We cannot call String.fromCharCode with as many arguments as we want
      for (let i = 0; i * chunksize < len; i++) {
        rawStrings.push(
          String.fromCharCode.apply(
            null,
            uarr.subarray(i * chunksize, (i + 1) * chunksize)
          )
        );
      }

      if (len < uarr.length) {
        rawStrings.push(
          "T3D Ignored the last " +
            (uarr.length - len) +
            " bytes when generating this raw output"
        );
      }

      self.getOutput().rawString = rawStrings.join();

      /// Check if this is an PF or ATEX file
      // Binareis are MZ
      let ds = new DataStream(inflatedData);
      let first4 = ds.readCString(4);

      /// Do special stuff for different fcc signatures
      ///
      /// fourcc != fcc::ATEX && fourcc != fcc::ATEC && fourcc != fcc::ATEP &&
      /// fourcc != fcc::ATET && fourcc != fcc::ATEU && fourcc != fcc::ATTX)
      ///
      if (
        first4 === "ATEX" ||
        first4 === "ATEC" ||
        first4 === "ATEP" ||
        first4 === "ATET" ||
        first4 === "ATEU" ||
        first4 === "ATTX"
      ) {
        /// TODO: MOVE TO GW2 texture file!!
        /// Load file using LocalReader.
        self.localReader.loadTextureFile(self.settings.id, function(
          inflatedData,
          dxtType,
          imageWidth,
          imageHeigth
        ) {
          /// Create image using returned data.
          let image = {
            data: new Uint8Array(inflatedData),
            width: imageWidth,
            height: imageHeigth
          };

          self.getOutput().image = image;
          callback();
        });
      } else if (first4.indexOf("PF") === 0) {
        self.getOutput().file = new GW2File(ds, 0);
        callback();
      } else {
        self.getOutput().file = null;
        callback();
      }
    });
  }
}

module.exports = DataRenderer;
