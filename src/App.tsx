import { useState, useRef, useCallback, useEffect, useReducer, useMemo, type CSSProperties } from "react";
import cn from "classnames";

import ErrorComponent from "./components/ErrorComponent/ErrorComponent";
import LoadingComponent from "./components/LoadingComponent/LoadingComponent";
import StartScreen from "./components/StartScreen/StartScreen";
import TouchControls from "./components/TouchControls/TouchControls";
import VirtualKeyboard from "./components/VirtualKeyboard/VirtualKeyboard";
import { createGameRuntime } from "./app/runtime";
import { transition } from "./app/runtime/lifecycleMachine";
import type { LifecycleState } from "./app/runtime/runtimeState";
import { useErrorHandling } from "./app/uiHooks/useErrorHandling";
import { useTouchControls } from "./app/uiHooks/useTouchControls";
import { DIABLO, TOUCH } from "./constants/controls";
import type { GameFunction, IProgress } from "./types";

import "./base.css";
import "./App.css";

const App = () => {
	const [started, setStarted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const [retail, setRetail] = useState<boolean | undefined>(undefined);
	const [isTouchMode, setIsTouchMode] = useState(false);
	const [keyboardStyle, setKeyboardStyle] = useState<CSSProperties | null>(null);
	const [currentSaveName, setCurrentSaveName] = useState<string | undefined>(undefined);
	const [lifecycleState, dispatchLifecycle] = useReducer(transition, "idle" as LifecycleState);

	const cursorPos = useRef({ x: 0, y: 0 });
	const game = useRef<GameFunction | null>(null);
	const elementRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const keyboardRef = useRef<HTMLInputElement | null>(null);
	const saveNameRef = useRef<string | undefined>(undefined);
	const cleanupRef = useRef<(() => void) | null>(null);
	const showKeyboard = useRef<CSSProperties | null>(null);
	const maxKeyboard = useRef(0);
	const keyboardNum = useRef(0);
	const touchButtons = useRef<(HTMLDivElement | null)[]>(Array(TOUCH.BUTTON_TOTAL).fill(null));
	const touchCtx = useRef<(CanvasRenderingContext2D | null)[]>(Array(TOUCH.BELT_BUTTON_COUNT).fill(null));
	const touchBelt = useRef<[number, number, number]>([-1, -1, -1]);

	const { error, onError } = useErrorHandling();
	const runtime = useMemo(() => createGameRuntime(), []);
	const handleError = useCallback(
		(message: string, stack?: string) => {
			const saveName = saveNameRef.current;
			if (!saveName) {
				onError(message, stack, undefined, retail);
				return;
			}
			runtime.getSaveUrl(saveName).then((saveUrl) => onError(message, stack, saveUrl, retail));
		},
		[onError, retail, runtime]
	);

	const runUiCleanup = useCallback(() => {
		cleanupRef.current = null;
		setStarted(false);
		setLoading(false);
		setRetail(undefined);
		showKeyboard.current = null;
		setKeyboardStyle(null);
		dispatchLifecycle("EXIT");
	}, []);

	const stopAndCleanup = useCallback(() => {
		const cleanup = cleanupRef.current;
		cleanupRef.current = null;
		runtime.stop();
		cleanup?.();
	}, [runtime]);

	useEffect(() => {
		return () => stopAndCleanup();
	}, [stopAndCleanup]);

	useEffect(() => {
		const unsubscribe = runtime.subscribeUI({
			onProgress: setProgress,
			onError: (payload) => handleError(payload.message, payload.stack),
			onSaveChanged: (payload) => {
				saveNameRef.current = payload.name ?? undefined;
				setCurrentSaveName(payload.name ?? undefined);
			},
			onExit: () => cleanupRef.current?.(),
			onReady: () => {
				/* empty */
			},
			onSavesChanged: () => {
				/* empty */
			},
		});
		return () => unsubscribe();
	}, [runtime, handleError]);

	useEffect(() => {
		return () => runtime.dispose();
	}, [runtime]);

	useEffect(() => {
		runtime.initInput({
			getTarget: () => document,
			refs: {
				canvas: canvasRef,
				keyboard: keyboardRef,
				element: elementRef,
				showKeyboard,
				maxKeyboard,
				keyboardNum,
				cursorPos,
				touchButtons,
				touchBelt,
			},
			setIsTouchMode,
		});
	}, [runtime, setIsTouchMode]);

	useEffect(() => {
		runtime.ensureStorageReady();
	}, [runtime]);

	const start = useCallback(async () => {
		stopAndCleanup();

		game.current = null;
		dispatchLifecycle("RESET");

		// Fetch diabdat.mpq from public folder
		const response = await fetch("/diabdat.mpq");
		if (!response.ok) {
			handleError("Failed to load diabdat.mpq. Make sure the file exists in the public folder.");
			return;
		}
		const blob = await response.blob();
		const file = new File([blob], "diabdat.mpq", { type: "application/octet-stream" });

		const startResult = runtime.startWithFile({
			file,
			apiFactory: (fs) =>
				runtime.createUiApi({
					fs,
					canvasRef,
					keyboardRef,
					cursorPosRef: cursorPos,
					showKeyboardRef: showKeyboard,
					maxKeyboardRef: maxKeyboard,
					keyboardNumRef: keyboardNum,
					touchButtonsRef: touchButtons,
					touchCtxRef: touchCtx,
					touchBeltRef: touchBelt,
					setKeyboardStyle,
					onError: handleError,
					onProgress: setProgress,
					onExit: () => cleanupRef.current?.(),
					setCurrentSave: (name) => {
						saveNameRef.current = name;
						setCurrentSaveName(name);
					},
				}),
			onBeforeStart: ({ isRetail }) => {
				setRetail(isRetail);
				setLoading(true);
				dispatchLifecycle("START");
			},
		});

		if (startResult.status !== "starting") return;

		startResult.promise.then(
			(loaded) => {
				game.current = loaded;

				setLoading(false);
				dispatchLifecycle("LOADED");
				setStarted(true);
				dispatchLifecycle("RUN");

				cleanupRef.current = () => {
					runUiCleanup();
					game.current = null;
				};
			},
			(err) => {
				handleError(err.message, err.stack);
				setLoading(false);
				dispatchLifecycle("FAIL");
			}
		);
	}, [handleError, runtime, runUiCleanup, stopAndCleanup]);

	useEffect(() => {
		const _debug = lifecycleState as string;
		void _debug;
	}, [lifecycleState]);

	useTouchControls(started, touchButtons, touchCtx);

	return (
		<main
			className={cn("app", {
				"app--touch": isTouchMode,
				"app--started": started,
				"app--keyboard": !!keyboardStyle,
			})}
			ref={elementRef}
			aria-label="Diablo Web"
		>
			<TouchControls enabled={started} touchButtons={touchButtons} />

			<section className="app__body" aria-label="Game viewport">
				<div className="app__inner">
					{!error && <canvas ref={canvasRef} width={DIABLO.WIDTH} height={DIABLO.HEIGHT} />}
					<VirtualKeyboard
						keyboardRef={keyboardRef}
						keyboardStyle={keyboardStyle}
						onInput={(blur) => runtime.handleKeyboardInput(blur)}
					/>
				</div>
			</section>

			<section className="app__body-v" aria-live="polite">
				{error && <ErrorComponent error={error} saveName={currentSaveName} />}

				{loading && !started && !error && <LoadingComponent title="Loading..." progress={progress} />}

				{!started && !loading && !error && <StartScreen start={start} />}
			</section>
		</main>
	);
};

export default App;
