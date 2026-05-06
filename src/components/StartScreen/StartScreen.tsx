import cn from "classnames";

import "./StartScreen.css";

interface IProps {
	start: () => void;
}

const StartScreen = ({ start }: IProps) => {
	return (
		<section
			className={cn("start-screen", "u-center-abs", "u-modal", "u-scrollbar-gold", "d1-panel")}
			role="dialog"
			aria-modal="true"
			aria-label="Start screen"
		>
			<button
				type="button"
				className={cn("start-screen__button", "d1-btn", "d1-btn--gold")}
				onClick={() => start()}
			>
				Play Diablo
			</button>
		</section>
	);
};

export default StartScreen;
