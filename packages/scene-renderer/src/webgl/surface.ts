export interface SurfaceTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_color;
uniform bool u_ellipse;
in vec2 v_texCoord;
out vec4 outColor;
void main() {
  if (u_ellipse) {
    vec2 centered = v_texCoord - vec2(0.5);
    if (dot(centered, centered) > 0.25) discard;
  }
  outColor = texture(u_texture, v_texCoord) * u_color;
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const diagnostic = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(diagnostic);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const diagnostic = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(diagnostic);
  }
  return program;
}

function requiredLocation<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`Missing WebGL location: ${label}`);
  return value;
}

export class WebGlSurface {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly textureCoordinateLocation: number;
  private readonly colorLocation: WebGLUniformLocation;
  private readonly ellipseLocation: WebGLUniformLocation;
  readonly whiteTexture: SurfaceTexture;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL 2 is not supported by this browser");
    this.gl = gl;
    this.program = createProgram(gl);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to create WebGL vertex buffer");
    this.vertexBuffer = buffer;
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.textureCoordinateLocation = gl.getAttribLocation(
      this.program,
      "a_texCoord",
    );
    this.colorLocation = requiredLocation(
      gl.getUniformLocation(this.program, "u_color"),
      "u_color",
    );
    this.ellipseLocation = requiredLocation(
      gl.getUniformLocation(this.program, "u_ellipse"),
      "u_ellipse",
    );
    gl.useProgram(this.program);
    gl.uniform1i(
      requiredLocation(
        gl.getUniformLocation(this.program, "u_texture"),
        "u_texture",
      ),
      0,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.whiteTexture = this.createTextureFromPixels(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
    );
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  clear() {
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  createTexture(source: TexImageSource): SurfaceTexture {
    const width =
      "displayWidth" in source
        ? source.displayWidth
        : "videoWidth" in source
          ? source.videoWidth
          : source.width;
    const height =
      "displayHeight" in source
        ? source.displayHeight
        : "videoHeight" in source
          ? source.videoHeight
          : source.height;
    const texture = this.createTextureObject();
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return { texture, width, height };
  }

  deleteTexture(texture: SurfaceTexture) {
    if (texture.texture !== this.whiteTexture.texture) {
      this.gl.deleteTexture(texture.texture);
    }
  }

  draw(
    texture: SurfaceTexture,
    vertices: Float32Array,
    color: [number, number, number, number],
    ellipse = false,
  ) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(
      this.positionLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      0,
    );
    gl.enableVertexAttribArray(this.textureCoordinateLocation);
    gl.vertexAttribPointer(
      this.textureCoordinateLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    gl.uniform4fv(this.colorLocation, color);
    gl.uniform1i(this.ellipseLocation, ellipse ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose() {
    this.gl.deleteTexture(this.whiteTexture.texture);
    this.gl.deleteBuffer(this.vertexBuffer);
    this.gl.deleteProgram(this.program);
  }

  private createTextureObject(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to create WebGL texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private createTextureFromPixels(
    pixels: Uint8Array,
    width: number,
    height: number,
  ): SurfaceTexture {
    const texture = this.createTextureObject();
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    return { texture, width, height };
  }
}
