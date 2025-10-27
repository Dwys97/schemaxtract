import React, { useRef, useEffect } from 'react';
import { Rect, Transformer } from 'react-konva';

/**
 * EditableBBox - Draggable and resizable bounding box
 */
function EditableBBox({ 
  bbox, 
  isSelected, 
  onSelect, 
  onChange,
  label 
}) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      // Attach transformer to shape
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = (e) => {
    onChange({
      ...bbox,
      x: e.target.x(),
      y: e.target.y()
    });
  };

  const handleTransformEnd = (e) => {
    const node = shapeRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    onChange({
      x: node.x(),
      y: node.y(),
      width: Math.max(5, node.width() * scaleX),
      height: Math.max(5, node.height() * scaleY)
    });
  };

  return (
    <>
      <Rect
        ref={shapeRef}
        x={bbox.x}
        y={bbox.y}
        width={bbox.width}
        height={bbox.height}
        stroke={isSelected ? '#1d72f3' : '#34c759'}
        strokeWidth={isSelected ? 3 : 2}
        fill={isSelected ? 'rgba(29, 114, 243, 0.15)' : 'rgba(52, 199, 89, 0.1)'}
        cornerRadius={4}
        draggable={isSelected}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseEnter={(e) => {
          const container = e.target.getStage().container();
          container.style.cursor = isSelected ? 'move' : 'pointer';
        }}
        onMouseLeave={(e) => {
          const container = e.target.getStage().container();
          container.style.cursor = 'default';
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit resize
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}

export default EditableBBox;
