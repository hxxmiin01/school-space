import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera, Text } from '@react-three/drei'
import { getRoomCode } from '../lib/roomName'

const CAMERA_ZOOM = 44
const CANVAS_HEIGHT = 620
const VIEWPORT_HALF_HEIGHT = CANVAS_HEIGHT / (2 * CAMERA_ZOOM)
const SCENE_FLOOR_WIDTH = 18.8
const SCENE_FLOOR_HEIGHT = 14.8
const SCENE_MIN_X = -SCENE_FLOOR_WIDTH / 2
const ROOM_CORRIDOR_GAP = 0.9
const ROOM_VIEWPORT_PADDING = 0.45
const CORRIDOR_CONNECT_OVERLAP = 0.3

const ROOM_SIZE = { width: 4.6, height: 3.9 }
const LEFT_ROOM_STACK_GAP = 0.85
const BOTTOM_ROOM_GAP = 0.8

const leftRoomX = SCENE_MIN_X + ROOM_SIZE.width / 2 + ROOM_VIEWPORT_PADDING
const room1TopEdgeZ = -VIEWPORT_HALF_HEIGHT + ROOM_VIEWPORT_PADDING
const room1Z = room1TopEdgeZ + ROOM_SIZE.height / 2
const room2Z = room1Z + ROOM_SIZE.height + LEFT_ROOM_STACK_GAP

const VERTICAL_CORRIDOR = {
  x: leftRoomX + ROOM_SIZE.width / 2 + ROOM_CORRIDOR_GAP + 1.8 / 2,
  z: -2.4,
  width: 1.8,
  height: 8.2,
}
const verticalBottomZ = VERTICAL_CORRIDOR.z + VERTICAL_CORRIDOR.height / 2
const HORIZONTAL_CORRIDOR = {
  x: VERTICAL_CORRIDOR.x + 9.8 / 2 - VERTICAL_CORRIDOR.width / 2,
  z: verticalBottomZ - 1.8 / 2 + CORRIDOR_CONNECT_OVERLAP,
  width: 9.8,
  height: 1.8,
}
const CORRIDOR_ZONES = [VERTICAL_CORRIDOR, HORIZONTAL_CORRIDOR]

const bottomRoomZ =
  HORIZONTAL_CORRIDOR.z + HORIZONTAL_CORRIDOR.height / 2 + ROOM_CORRIDOR_GAP + ROOM_SIZE.height / 2
const room3X = VERTICAL_CORRIDOR.x
const room4X = room3X + ROOM_SIZE.width + BOTTOM_ROOM_GAP

const ROOM_LAYOUT = [
  {
    roomNumber: 1,
    code: 'A',
    theme: 'Botanical',
    color: '#22c55e',
    x: leftRoomX,
    z: room1Z,
    width: ROOM_SIZE.width,
    height: ROOM_SIZE.height,
    door: { x: leftRoomX + ROOM_SIZE.width / 2, z: room1Z },
    doorSide: 'right',
    requiredApproach: 'from-right',
  },
  {
    roomNumber: 2,
    code: 'B',
    theme: 'Artist',
    color: '#f97316',
    x: leftRoomX,
    z: room2Z,
    width: ROOM_SIZE.width,
    height: ROOM_SIZE.height,
    door: { x: leftRoomX + ROOM_SIZE.width / 2, z: room2Z },
    doorSide: 'right',
    requiredApproach: 'from-right',
  },
  {
    roomNumber: 3,
    code: 'C',
    theme: 'Data Tech',
    color: '#3b82f6',
    x: room3X,
    z: bottomRoomZ,
    width: ROOM_SIZE.width,
    height: ROOM_SIZE.height,
    door: { x: room3X, z: bottomRoomZ - ROOM_SIZE.height / 2 },
    doorSide: 'top',
  },
  {
    roomNumber: 4,
    code: 'D',
    theme: 'Leather Craft',
    color: '#8b5e3c',
    x: room4X,
    z: bottomRoomZ,
    width: ROOM_SIZE.width,
    height: ROOM_SIZE.height,
    door: { x: room4X, z: bottomRoomZ - ROOM_SIZE.height / 2 },
    doorSide: 'top',
  },
]

const PLAYER_RADIUS = 0.32
const PLAYER_SPEED = 4.4
const INTERACTION_DISTANCE = 1.25
const START_POSITION = [VERTICAL_CORRIDOR.x, 0.35, HORIZONTAL_CORRIDOR.z]

function CameraLookAtCenter() {
  const { camera } = useThree()

  useEffect(() => {
    // Top-down orthographic view: remove isometric diagonal angle.
    camera.position.set(0, 24, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isWalkable(x, z) {
  return CORRIDOR_ZONES.some(
    (zone) =>
      x >= zone.x - zone.width / 2 + PLAYER_RADIUS &&
      x <= zone.x + zone.width / 2 - PLAYER_RADIUS &&
      z >= zone.z - zone.height / 2 + PLAYER_RADIUS &&
      z <= zone.z + zone.height / 2 - PLAYER_RADIUS
  )
}

function collidesWithRoomWalls(x, z) {
  return ROOM_LAYOUT.some((room) => {
    const minX = room.x - room.width / 2 - PLAYER_RADIUS
    const maxX = room.x + room.width / 2 + PLAYER_RADIUS
    const minZ = room.z - room.height / 2 - PLAYER_RADIUS
    const maxZ = room.z + room.height / 2 + PLAYER_RADIUS
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ
  })
}

function getInteractionPoint(layout) {
  if (layout.requiredApproach === 'from-right') {
    return { x: layout.door.x + ROOM_CORRIDOR_GAP * 0.45, z: layout.door.z }
  }

  if (layout.doorSide === 'top') {
    return { x: layout.door.x, z: layout.door.z - ROOM_CORRIDOR_GAP * 0.45 }
  }

  return { x: layout.door.x, z: layout.door.z }
}

function useKeyboardMovement() {
  const keysRef = useRef(new Set())

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault()
        keysRef.current.add(key)
      }
    }

    const onKeyUp = (event) => {
      keysRef.current.delete(event.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keysRef.current.clear()
    }
  }, [])

  return keysRef
}

function RoomHint({ visible, position }) {
  if (!visible) return null

  return (
    <Html position={[position.x, 1.05, position.z]} center>
      <div className="pointer-events-none rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-blue-600 shadow-sm">
        [E]
      </div>
    </Html>
  )
}

function RoomPlane({ layout }) {
  return (
    <group position={[layout.x, 0.05, layout.z]}>
      <mesh>
        <planeGeometry args={[layout.width + 0.34, layout.height + 0.34]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[layout.width, layout.height]} />
        <meshStandardMaterial color={layout.color} />
      </mesh>
      <Text
        position={[0, 0.08, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.46}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        maxWidth={layout.width - 0.5}
      >
        {`스터디룸 ${layout.code}`}
      </Text>
    </group>
  )
}

function CorridorFloor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SCENE_FLOOR_WIDTH, SCENE_FLOOR_HEIGHT]} />
        <meshStandardMaterial color="#dbeafe" />
      </mesh>

      <group>
        {CORRIDOR_ZONES.map((zone, index) => (
          <mesh key={index} position={[zone.x, 0.02, zone.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[zone.width, zone.height]} />
            <meshStandardMaterial color="#fefce8" />
          </mesh>
        ))}
      </group>
    </>
  )
}

function CharacterSprite({ positionRef, movingRef }) {
  const rootRef = useRef(null)
  const bobRef = useRef(0)

  useFrame((_, delta) => {
    const moving = movingRef.current
    bobRef.current += moving ? delta * 9 : delta * 2

    if (!rootRef.current) return
    rootRef.current.position.set(positionRef.current[0], positionRef.current[1], positionRef.current[2])
    rootRef.current.position.y = positionRef.current[1] + (moving ? Math.sin(bobRef.current) * 0.05 : 0)
    // Keep sprite billboard behavior stable in top-down mode.
    rootRef.current.rotation.y = 0
  })

  return (
    <group ref={rootRef}>
      <mesh position={[0, -0.39, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.28} />
      </mesh>
      <mesh position={[0, 0.82, 0.01]}>
        <capsuleGeometry args={[0.24, 0.5, 4, 12]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  )
}

function PlayerController({ rooms, onNearRoomChange, onInteractRoom }) {
  const { camera, size } = useThree()
  const keysRef = useKeyboardMovement()
  const positionRef = useRef([...START_POSITION])
  const movingRef = useRef(false)
  const interactedRef = useRef(false)

  const getScreenBounds = () => {
    const zoom = camera.zoom || 1
    const halfWidth = size.width / (2 * zoom)
    const halfHeight = size.height / (2 * zoom)
    return {
      minX: -halfWidth + PLAYER_RADIUS,
      maxX: halfWidth - PLAYER_RADIUS,
      minZ: -halfHeight + PLAYER_RADIUS,
      maxZ: halfHeight - PLAYER_RADIUS,
    }
  }

  useFrame((_, delta) => {
    const keys = keysRef.current
    const pressed = (key) => keys.has(key)

    let moveX = 0
    let moveZ = 0
    if (pressed('w') || pressed('arrowup')) moveZ -= 1
    if (pressed('s') || pressed('arrowdown')) moveZ += 1
    if (pressed('a') || pressed('arrowleft')) moveX -= 1
    if (pressed('d') || pressed('arrowright')) moveX += 1

    movingRef.current = moveX !== 0 || moveZ !== 0

    if (movingRef.current) {
      const length = Math.hypot(moveX, moveZ) || 1
      const step = PLAYER_SPEED * delta
      const bounds = getScreenBounds()
      const nextX = clamp(positionRef.current[0] + (moveX / length) * step, bounds.minX, bounds.maxX)
      const nextZ = clamp(positionRef.current[2] + (moveZ / length) * step, bounds.minZ, bounds.maxZ)

      const canMoveX = isWalkable(nextX, positionRef.current[2]) && !collidesWithRoomWalls(nextX, positionRef.current[2])
      const canMoveZ = isWalkable(positionRef.current[0], nextZ) && !collidesWithRoomWalls(positionRef.current[0], nextZ)

      if (canMoveX) positionRef.current[0] = nextX
      if (canMoveZ) positionRef.current[2] = nextZ
    }

    const nearestRoom = rooms.reduce((best, slot) => {
      const target = slot.interactionPoint || slot.door
      const dx = target.x - positionRef.current[0]
      const dz = target.z - positionRef.current[2]
      const distance = Math.hypot(dx, dz)
      if (!best || distance < best.distance) return { slot, distance }
      return best
    }, null)

    let nearSlot = nearestRoom && nearestRoom.distance <= INTERACTION_DISTANCE ? nearestRoom.slot : null
    if (nearSlot?.requiredApproach === 'from-right' && positionRef.current[0] < nearSlot.door.x) {
      nearSlot = null
    }
    onNearRoomChange?.(nearSlot?.room ?? null)

    const ePressed = pressed('e')
    if (ePressed && nearSlot?.room && !interactedRef.current) {
      interactedRef.current = true
      onInteractRoom?.(nearSlot.room)
    }
    if (!ePressed) interactedRef.current = false
  })

  return <CharacterSprite positionRef={positionRef} movingRef={movingRef} />
}

function RoomScene({ rooms, nearRoomId, isInteractionOpen = false, onNearRoomChange, onInteractRoom }) {
  const roomByCode = useMemo(() => {
    return (rooms || []).reduce((map, room) => {
      const code = room?.room_code || getRoomCode(room?.name)
      if (!code) return map
      map.set(code, room)
      return map
    }, new Map())
  }, [rooms])

  const slotRooms = useMemo(
    () =>
      ROOM_LAYOUT.map((layout, index) => ({
        ...layout,
        interactionPoint: getInteractionPoint(layout),
        room: (() => {
          const matchedRoom = roomByCode.get(layout.code) ?? rooms[index]
          if (matchedRoom) {
            return {
              ...matchedRoom,
              name: `스터디룸 ${layout.code}`,
            }
          }
          return {
            id: `placeholder-${index + 1}`,
            name: `스터디룸 ${layout.code}`,
            status: 'available',
          }
        })(),
      })),
    [roomByCode, rooms]
  )

  const cameraPosition = useMemo(() => [0, 24, 0], [])

  return (
    <div className="relative h-[620px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
      <Canvas>
        <OrthographicCamera makeDefault position={cameraPosition} zoom={CAMERA_ZOOM} />
        <CameraLookAtCenter />
        <ambientLight intensity={0.95} />
        <directionalLight position={[-5, 12, 8]} intensity={0.95} />
        <directionalLight position={[8, 8, -5]} intensity={0.45} />

        <color attach="background" args={['#eef2ff']} />
        <CorridorFloor />

        {slotRooms.map((slot) => (
          <group key={slot.room.id}>
            <RoomPlane layout={slot} />
            <RoomHint visible={!isInteractionOpen && nearRoomId === slot.room.id} position={slot.interactionPoint} />
          </group>
        ))}

        <PlayerController rooms={slotRooms} onNearRoomChange={onNearRoomChange} onInteractRoom={onInteractRoom} />
      </Canvas>
    </div>
  )
}

export default RoomScene
