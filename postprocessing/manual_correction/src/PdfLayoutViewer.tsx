import React, { useState, useEffect, useRef } from 'react'


// for receiving correct json data

interface Span {
  bbox: number[]
  score: number
  content: string
  type: string
}

interface Line {
  bbox: number[]
  spans: Span[]
}

interface Block {
  type: string
  bbox: number[]
  lines: Line[]
}

interface LayoutBox {
  layout_bbox: number[]
  layout_label: string
  sub_layout: any[]
}

interface PageInfo {
  preproc_blocks: Block[]
  layout_bboxes: LayoutBox[]
  page_idx: number
  page_size: number[]
  _layout_tree: LayoutBox[]
  images: any[]
  tables: any[]
  interline_equations: Block[]
  discarded_blocks: Block[]
  need_drop: boolean
  drop_reason: any[]
  para_blocks: Block[]
}

interface JsonData {
  pdf_info: PageInfo[]
  _parse_type: string
  _version_name: string
}

// for drawing rectangles
const categoryColors = {
  title: "black",
  image: "blue",
  text: "grey",
  interline_equation: "green",
}


interface PDFLayoutViewerProps {
  baseUrl: string
  filePrefix: string
  initialPageNumber: number
  formatPageNumber: (num: number) => string
}

interface DraggableRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: string;
}

enum DragMode {
  None,
  Move,
  ResizeTop,
  ResizeRight,
  ResizeBottom,
  ResizeLeft,
  ResizeTopLeft,
  ResizeTopRight,
  ResizeBottomLeft,
  ResizeBottomRight,
}

export default function PDFLayoutViewer({
  baseUrl,
  filePrefix, 
  initialPageNumber,
  formatPageNumber
}: PDFLayoutViewerProps) {
  const [pageNumber, setPageNumber] = useState(initialPageNumber)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [jsonData, setJsonData] = useState<JsonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [rectangles, setRectangles] = useState<DraggableRect[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>(DragMode.None);
  const [draggedRectId, setDraggedRectId] = useState<string | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true)
        const formattedPageNumber = formatPageNumber(pageNumber)
        
        // Fetch JSON file
        const jsonResponse = await fetch(`${baseUrl}/api/get-json-file?fileName=${encodeURIComponent(`${filePrefix}-${formattedPageNumber}`)}`)
        if (!jsonResponse.ok) {
          throw new Error('Failed to load JSON file')
        }
        const data = await jsonResponse.json()
        setJsonData(data)

        // Fetch image file
        const imageResponse = await fetch(`${baseUrl}/api/get-pdf-file?fileName=${encodeURIComponent(`${filePrefix}-${formattedPageNumber}`)}`)
        if (!imageResponse.ok) {
          throw new Error('Failed to load image file')
        }
        const imageBlob = await imageResponse.blob()
        setImageUrl(URL.createObjectURL(imageBlob))

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
        console.error(err)
        setLoading(false)
      }
    }

    loadFiles()
  }, [filePrefix, pageNumber])

  const drawRectangles = () => {
    if (!canvasRef.current || !jsonData || !imageRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const image = imageRef.current;
    canvas.width = image.width;
    canvas.height = image.height;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the rectangles
    rectangles.forEach((rect) => {
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = rect.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw resize handles
      const handleSize = 8;
      ctx.fillStyle = rect.color;
      // Corner handles
      ctx.fillRect(rect.x - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.width - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x - handleSize / 2, rect.y + rect.height - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.width - handleSize / 2, rect.y + rect.height - handleSize / 2, handleSize, handleSize);
      // Edge handles
      ctx.fillRect(rect.x + rect.width / 2 - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.width - handleSize / 2, rect.y + rect.height / 2 - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.width / 2 - handleSize / 2, rect.y + rect.height - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x - handleSize / 2, rect.y + rect.height / 2 - handleSize / 2, handleSize, handleSize);
    });
  };

  useEffect(() => {
    if (jsonData) {
      const jd001 = jsonData.pdf_info[0];
      if (jd001.preproc_blocks) {
        const newRectangles = jd001.preproc_blocks.map((block: Block, index: number) => {
          const [x0, y0, x1, y1] = block.bbox;
          return {
            id: `rect-${index}`,
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
            color: categoryColors[block.type as keyof typeof categoryColors] || 'black',
            type: block.type,
          };
        });
        setRectangles(newRectangles);
      }
    }
  }, [jsonData]);

  useEffect(() => {
    drawRectangles();
  }, [rectangles]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const handleSize = 8;
    const clickedRect = rectangles.find(r => {
      // Check if clicked on resize handles
      if (Math.abs(x - r.x) <= handleSize && Math.abs(y - r.y) <= handleSize) {
        setDragMode(DragMode.ResizeTopLeft);
        return true;
      }
      if (Math.abs(x - (r.x + r.width)) <= handleSize && Math.abs(y - r.y) <= handleSize) {
        setDragMode(DragMode.ResizeTopRight);
        return true;
      }
      if (Math.abs(x - r.x) <= handleSize && Math.abs(y - (r.y + r.height)) <= handleSize) {
        setDragMode(DragMode.ResizeBottomLeft);
        return true;
      }
      if (Math.abs(x - (r.x + r.width)) <= handleSize && Math.abs(y - (r.y + r.height)) <= handleSize) {
        setDragMode(DragMode.ResizeBottomRight);
        return true;
      }
      // Edge handles
      if (Math.abs(x - (r.x + r.width / 2)) <= handleSize && Math.abs(y - r.y) <= handleSize) {
        setDragMode(DragMode.ResizeTop);
        return true;
      }
      if (Math.abs(x - (r.x + r.width)) <= handleSize && Math.abs(y - (r.y + r.height / 2)) <= handleSize) {
        setDragMode(DragMode.ResizeRight);
        return true;
      }
      if (Math.abs(x - (r.x + r.width / 2)) <= handleSize && Math.abs(y - (r.y + r.height)) <= handleSize) {
        setDragMode(DragMode.ResizeBottom);
        return true;
      }
      if (Math.abs(x - r.x) <= handleSize && Math.abs(y - (r.y + r.height / 2)) <= handleSize) {
        setDragMode(DragMode.ResizeLeft);
        return true;
      }
      // Check if clicked inside the rectangle
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        setDragMode(DragMode.Move);
        return true;
      }
      return false;
    });

    if (clickedRect) {
      setDraggedRectId(clickedRect.id);
      setLastMousePos({ x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMode === DragMode.None || !draggedRectId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - lastMousePos.x;
    const dy = y - lastMousePos.y;

    setRectangles(prevRects => prevRects.map(r => {
      if (r.id !== draggedRectId) return r;

      switch (dragMode) {
        case DragMode.Move:
          return { ...r, x: r.x + dx, y: r.y + dy };
        case DragMode.ResizeTop:
          return { ...r, y: r.y + dy, height: r.height - dy };
        case DragMode.ResizeRight:
          return { ...r, width: r.width + dx };
        case DragMode.ResizeBottom:
          return { ...r, height: r.height + dy };
        case DragMode.ResizeLeft:
          return { ...r, x: r.x + dx, width: r.width - dx };
        case DragMode.ResizeTopLeft:
          return { ...r, x: r.x + dx, y: r.y + dy, width: r.width - dx, height: r.height - dy };
        case DragMode.ResizeTopRight:
          return { ...r, y: r.y + dy, width: r.width + dx, height: r.height - dy };
        case DragMode.ResizeBottomLeft:
          return { ...r, x: r.x + dx, width: r.width - dx, height: r.height + dy };
        case DragMode.ResizeBottomRight:
          return { ...r, width: r.width + dx, height: r.height + dy };
        default:
          return r;
      }
    }));

    setLastMousePos({ x, y });
  };

  const handleMouseUp = () => {
    setDragMode(DragMode.None);
    setDraggedRectId(null);
  };

  const handlePreviousPage = () => {
    setPageNumber((prevNumber) => Math.max(0, prevNumber - 1))
  }

  const handleNextPage = () => {
    setPageNumber((prevNumber) => prevNumber + 1)
  }

  const handleImageLoad = () => {
    if (imageRef.current) {
      const { width, height } = imageRef.current
      setImageDimensions({ width, height })
    }
    drawRectangles()
  }

  // Function to calculate relative sizes
  const getRelativeSizes = () => {
    const baseWidth = 1000 // Assume this is our base width for scaling
    const scale = imageDimensions.width / baseWidth
    return {
      buttonWidth: `${Math.min(40, Math.max(20, 30 * scale))}%`, // Further decreased button width
      fontSize: `${Math.min(1.6, Math.max(1, 1.3 * scale))}rem`, // Further reduced font size
      padding: `${Math.min(0.8, Math.max(0.4, 0.6 * scale))}rem ${Math.min(1.2, Math.max(0.6, 0.9 * scale))}rem` // Further adjusted padding
    }
  }

  const { buttonWidth, fontSize, padding } = getRelativeSizes()

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen text-red-500">{error}</div>
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100">
      <div className="relative w-full">
        {imageUrl && (
          <>
            <img
              ref={imageRef}
              src={imageUrl}
              alt={`Page ${pageNumber + 1}`}
              onLoad={handleImageLoad}
              className="w-full h-auto"
            />
            <canvas
              ref={canvasRef}
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: 'transparent'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </>
        )}
      </div>
      <div className="flex flex-col space-y-4 mt-8 w-full items-center">
        <button
          onClick={handlePreviousPage}
          disabled={pageNumber <= 0}
          style={{ width: buttonWidth, fontSize, padding }}
          className="bg-blue-500 text-white rounded-lg disabled:bg-gray-300 font-bold shadow-lg hover:bg-blue-600 transition-colors"
        >
          Previous Page
        </button>
        <span
          style={{ width: buttonWidth, fontSize, padding }}
          className="bg-white rounded-lg font-bold shadow-lg text-center"
        >
          Page {pageNumber + 1}
        </span>
        <button
          onClick={handleNextPage}
          disabled={false}
          style={{ width: buttonWidth, fontSize, padding }}
          className="bg-blue-500 text-white rounded-lg disabled:bg-gray-300 font-bold shadow-lg hover:bg-blue-600 transition-colors"
        >
          Next Page
        </button>
      </div>
    </div>
  )
}