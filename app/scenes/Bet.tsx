import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { StarredIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import Subheading from "~/components/Subheading";

type Color = "red" | "black" | "green";

interface WheelNumber {
  label: string;
  value: number | "00";
  color: Color;
  angle: number;
}

type InsideBetType = "straight" | "split" | "street" | "corner" | "sixLine";
type OutsideBetType = "red" | "black" | "odd" | "even" | "low" | "high";
type BetKind = InsideBetType | OutsideBetType;

interface Bet {
  id: string;
  type: BetKind;
  numbers: Array<number | "00">;
  label: string;
  amount: number;
  chipColor: string;
}

const AMERICAN_SEQUENCE: Array<number | "00"> = [
  0, 2, 14, 35, 23, 4, 16, 33, 21, 6, 18, 31, 19, 8, 12, 29, 25, 10, 27, "00",
  1, 13, 36, 24, 3, 15, 34, 22, 5, 17, 32, 20, 7, 11, 30, 26, 9, 28,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const BOARD_GRID: number[][] = (() => {
  const rows: number[][] = [[], [], []];
  for (let columnIndex = 0; columnIndex < 12; columnIndex += 1) {
    const base = columnIndex * 3;
    rows[2].push(base + 1);
    rows[1].push(base + 2);
    rows[0].push(base + 3);
  }
  return rows;
})();

function getBoardNumber(rowIndex: number, columnIndex: number): number {
  return BOARD_GRID[rowIndex][columnIndex];
}

function makeSplitLabel(a: number, b: number): string {
  const sorted = [a, b].sort((x, y) => x - y);
  return `split-${sorted.join("-")}`;
}

function makeCornerLabel(nums: number[]): string {
  const sorted = [...nums].sort((x, y) => x - y);
  return `corner-${sorted.join("-")}`;
}

const ZERO_TRIO_NUMBERS: [number | "00", number, number] = [0, 2, 3];
const ZERO_FOUR_NUMBERS: [number | "00", number, number, number] = [0, 1, 2, 3];

const INITIAL_BALANCE = 200;
const RESULT_OVERLAY_DURATION_MS = 3000;
const WHEEL_SPIN_DURATION_MS = 3000;
const MIN_BET = 5;

const CHIP_DENOMINATIONS = [
  { value: 5, color: "#bdc3c7" },
  { value: 10, color: "#2980b9" },
  { value: 25, color: "#27ae60" },
  { value: 50, color: "#c0392b" },
  { value: 100, color: "#f1c40f" },
  { value: 200, color: "#e67e22" },
  { value: 500, color: "#000000" },
  { value: 1000, color: "#8e44ad" },
];

class PlayerBankroll {
  public balance: number;
  public constructor(initialBalance: number) {
    this.balance = initialBalance;
  }
  public canPlace(amount: number): boolean {
    if (amount <= 0) return false;
    return this.balance >= amount;
  }
  public debit(amount: number): void {
    if (!this.canPlace(amount)) throw new Error("insufficient balance.");
    this.balance -= amount;
  }
  public credit(amount: number): void {
    if (amount <= 0) return;
    this.balance += amount;
  }
}

function getColorForValue(value: number | "00"): Color {
  if (value === 0 || value === "00") return "green";
  return RED_NUMBERS.has(value) ? "red" : "black";
}

function getWheelNumbers(): WheelNumber[] {
  const step = 360 / AMERICAN_SEQUENCE.length;
  return AMERICAN_SEQUENCE.map((value, index) => ({
    label: typeof value === "number" ? String(value) : value,
    value,
    color: getColorForValue(value),
    angle: index * step,
  }));
}

function getRandomIndex(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  if (typeof window !== "undefined") {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] % maxExclusive;
    }
  }
  return Math.floor(Math.random() * maxExclusive);
}

function getPayoutMultiplier(bet: Bet, winning: number | "00"): number {
  const hits = bet.numbers.includes(winning);
  if (!hits) return 0;
  switch (bet.type) {
    case "straight": return 35;
    case "split": return 17;
    case "street": return 11;
    case "corner": return 8;
    case "sixLine": return 5;
    case "column":
    case "dozen": return 2;
    case "red":
    case "black":
    case "odd":
    case "even":
    case "low":
    case "high": return 1;
    default: return 0;
  }
}

function formatWinningMessage(
  winning: number | "00",
  color: Color,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const colorLabel =
    color === "green" ? t("Green") : color === "red" ? t("Red") : t("Black");
  return t("The winner is {{ value }} {{ color }}!", {
    value: typeof winning === "number" ? winning : winning,
    color: colorLabel,
  });
}

// CAPA DE RENDERIZADO GLOBAL PARA LAS FICHAS
const GlobalChipLayer = ({ bets }: { bets: Bet[] }) => {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const updatePositions = () => {
      const newPos: Record<string, { x: number; y: number }> = {};
      bets.forEach((bet) => {
        const domId = `bet-${bet.type}-${bet.label}`;
        const el = document.getElementById(domId);
        if (el) {
          const rect = el.getBoundingClientRect();
          newPos[bet.id] = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      });
      setPositions(newPos);
    };

    updatePositions();
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, true);

    return () => {
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
    };
  }, [bets]);

  if (bets.length === 0) return null;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 99999 }}>
      {bets.map((bet) => {
        const pos = positions[bet.id];
        if (!pos) return null;
        return (
          <ChipOverlay
            key={bet.id}
            $color={bet.chipColor}
            style={{ left: pos.x, top: pos.y }}
          >
            {bet.amount}
          </ChipOverlay>
        );
      })}
    </div>
  );
};

const BetScene = () => {
  const { t } = useTranslation();
  const wheelNumbers = useMemo(() => getWheelNumbers(), []);

  const bankRef = useRef<PlayerBankroll | null>(null);
  const spinInProgressRef = useRef(false);
  const ballAnimationFrame = useRef<number | null>(null);

  if (!bankRef.current) {
    bankRef.current = new PlayerBankroll(INITIAL_BALANCE);
  }

  const [balance, setBalance] = useState<number>(bankRef.current.balance);
  const [currentBets, setCurrentBets] = useState<Bet[]>([]);
  const [chipValue, setChipValue] = useState<number>(CHIP_DENOMINATIONS[0].value);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIndex, setWinningIndex] = useState<number | null>(null);
  const [lastWinning, setLastWinning] = useState<number | "00" | null>(null);
  const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
  const [ballAngle, setBallAngle] = useState(0);

  const totalBetAmount = useMemo(
    () => currentBets.reduce((sum, bet) => sum + bet.amount, 0),
    [currentBets]
  );

  useEffect(() => {
    if (!bankRef.current) return;
    bankRef.current.balance = balance;
  }, [balance]);

  useEffect(() => {
    if (!showWinnerOverlay || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => {
      setShowWinnerOverlay(false);
    }, RESULT_OVERLAY_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [showWinnerOverlay]);

  const handleChangeChip = (value: number) => {
    setChipValue(value);
  };

  const addBet = (bet: Omit<Bet, "id" | "amount">) => {
    const totalAfter = totalBetAmount + chipValue;
    if (!bankRef.current || !bankRef.current.canPlace(totalAfter)) return;

    // Lógica para determinar el color de la ficha según el monto acumulado
    const getOptimalChipColor = (amount: number): string => {
      let optimalColor = CHIP_DENOMINATIONS[0].color;
      for (let i = CHIP_DENOMINATIONS.length - 1; i >= 0; i--) {
        if (amount >= CHIP_DENOMINATIONS[i].value) {
          optimalColor = CHIP_DENOMINATIONS[i].color;
          break;
        }
      }
      return optimalColor;
    };

    setCurrentBets((prev) => {
      const existingIndex = prev.findIndex(
        (b) => b.type === bet.type && b.label === bet.label
      );

      if (existingIndex >= 0) {
        const copy = [...prev];
        const existing = copy[existingIndex];
        const newAmount = existing.amount + chipValue;

        copy[existingIndex] = {
          ...existing,
          amount: newAmount,
          chipColor: getOptimalChipColor(newAmount), // Recalcula el color aquí
        };
        return copy;
      }

      const next: Bet = {
        ...bet,
        id: `${bet.type}-${bet.label}`,
        amount: chipValue,
        chipColor: getOptimalChipColor(chipValue),
      };
      return [...prev, next];
    });
  };

  const handleInsideNumberClick = (value: number | "00") => {
    addBet({
      type: "straight",
      numbers: [value],
      label: typeof value === "number" ? String(value) : "00",
    });
  };

  const handleOutsideClick = (type: OutsideBetType) => {
    const numbers: Array<number | "00"> = [];
    if (type === "red" || type === "black") {
      for (let i = 1; i <= 36; i += 1) {
        const color = getColorForValue(i);
        if (type === "red" && color === "red") numbers.push(i);
        if (type === "black" && color === "black") numbers.push(i);
      }
    } else if (type === "odd" || type === "even") {
      for (let i = 1; i <= 36; i += 1) {
        if (type === "odd" && i % 2 === 1) numbers.push(i);
        if (type === "even" && i % 2 === 0) numbers.push(i);
      }
    } else if (type === "low" || type === "high") {
      for (let i = 1; i <= 36; i += 1) {
        if (type === "low" && i >= 1 && i <= 18) numbers.push(i);
        if (type === "high" && i >= 19 && i <= 36) numbers.push(i);
      }
    }
    addBet({ type, numbers, label: type });
  };

  const clearBets = () => {
    setCurrentBets([]);
  };

  const handleDozenClick = (index: 1 | 2 | 3) => {
    const start = index === 1 ? 1 : index === 2 ? 13 : 25;
    const end = index === 1 ? 12 : index === 2 ? 24 : 36;
    const numbers: Array<number | "00"> = [];
    for (let i = start; i <= end; i += 1) numbers.push(i);
    const label = index === 1 ? "1st 12" : index === 2 ? "2nd 12" : "3rd 12";
    addBet({ type: "high", numbers, label });
  };

  const handleColumnClick = (index: 1 | 2 | 3) => {
    const numbers: Array<number | "00"> = [];
    for (let i = index; i <= 36; i += 3) numbers.push(i);
    const label = "2 to 1";
    addBet({ type: "high", numbers, label: `${label}-${index}` });
  };

  const handleSplitClick = (a: number, b: number) => {
    const label = makeSplitLabel(a, b);
    addBet({ type: "split", numbers: [a, b], label });
  };

  const handleCornerClick = (topLeft: number, topRight: number, bottomLeft: number, bottomRight: number) => {
    const label = makeCornerLabel([topLeft, topRight, bottomLeft, bottomRight]);
    addBet({ type: "corner", numbers: [topLeft, topRight, bottomLeft, bottomRight], label });
  };

  const handleZeroTrioClick = () => {
    const [z, a, b] = ZERO_TRIO_NUMBERS;
    addBet({ type: "street", numbers: [z, a, b], label: `trio-${z}-${a}-${b}` });
  };

  const handleZeroFourClick = () => {
    const [z, a, b, c] = ZERO_FOUR_NUMBERS;
    addBet({ type: "corner", numbers: [z, a, b, c], label: makeCornerLabel([1, 2, 3]) });
  };

  const handleSpin = () => {
    if (spinInProgressRef.current || isSpinning || currentBets.length === 0 || !bankRef.current) return;

    if (totalBetAmount < MIN_BET) {
      if (typeof window !== "undefined") {
        window.alert("La apuesta mínima es de 5 créditos.");
      }
      return;
    }

    const bank = bankRef.current;
    const total = totalBetAmount;
    try {
      bank.debit(total);
    } catch {
      return;
    }

    const betsAtStart = currentBets;
    const index = getRandomIndex(wheelNumbers.length);
    const winning = wheelNumbers[index];

    spinInProgressRef.current = true;
    setBalance(bank.balance);
    setIsSpinning(true);
    setWinningIndex(index);

    if (typeof window === "undefined") {
      let winnings = 0;
      betsAtStart.forEach((bet) => {
        const multiplier = getPayoutMultiplier(bet, winning.value);
        if (multiplier > 0) winnings += bet.amount * (multiplier + 1);
      });
      if (winnings > 0) bank.credit(winnings);

      setBalance(bank.balance);
      setIsSpinning(false);
      setLastWinning(winning.value);
      setShowWinnerOverlay(true);
      setCurrentBets([]);
      spinInProgressRef.current = false;
      return;
    }

    const startAngle = winning.angle + 720;
    const endAngle = winning.angle;
    const startTime = window.performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const tParam = Math.min(1, elapsed / WHEEL_SPIN_DURATION_MS);
      const eased = 1 - (1 - tParam) * (1 - tParam);
      const currentAngle = startAngle + (endAngle - startAngle) * eased;
      setBallAngle(currentAngle);

      if (tParam < 1) {
        ballAnimationFrame.current = window.requestAnimationFrame(animate);
        return;
      }

      let winnings = 0;
      betsAtStart.forEach((bet) => {
        const multiplier = getPayoutMultiplier(bet, winning.value);
        if (multiplier > 0) winnings += bet.amount * (multiplier + 1);
      });

      if (winnings > 0) bank.credit(winnings);

      setBalance(bank.balance);
      setIsSpinning(false);
      setLastWinning(winning.value);
      setShowWinnerOverlay(true);
      setCurrentBets([]);
      spinInProgressRef.current = false;
    };

    setBallAngle(startAngle);
    ballAnimationFrame.current = window.requestAnimationFrame(animate);
  };

  const winningNumber = useMemo(
    () => (winningIndex != null ? wheelNumbers[winningIndex] : undefined),
    [wheelNumbers, winningIndex]
  );

  return (
    <Scene icon={<StarredIcon />} title={t("Bet")}>
      <Heading>{t("Bet")}</Heading>
      <Subheading>{t("Try your luck on the American roulette wheel.")}</Subheading>
      <Felt>
        <TopBar>
          <WinnerPanel>
            <PanelTitle>{t("Winning number")}</PanelTitle>
            <PanelValue>
              {lastWinning === null
                ? t("—")
                : typeof lastWinning === "number"
                  ? lastWinning
                  : lastWinning}
            </PanelValue>
          </WinnerPanel>
          <WheelTypePanel>
            <PanelTitle>{t("Wheel")}</PanelTitle>
            <CheckboxRow>
              <input type="checkbox" checked readOnly />
              <span>{t("American")}</span>
            </CheckboxRow>
          </WheelTypePanel>
          <BalancePanel>
            <PanelTitle>{t("Balance / Bet")}</PanelTitle>
            <BalanceRow>
              <span>{t("Balance")}: {balance}</span>
              <span>{t("Bet")}: {totalBetAmount}</span>
            </BalanceRow>
          </BalancePanel>
        </TopBar>
        <ContentRow>
          <WheelArea>
            <WoodRing>
              <DiamondInlay />
              <InnerRing>
                <NumberRing
                  style={{
                    background: `conic-gradient(from -${180 / 38}deg, ${wheelNumbers
                      .map(
                        (n, i) =>
                          `${n.color === "green"
                            ? "#0f8a3b"
                            : n.color === "red"
                              ? "#b0122c"
                              : "#1a1a1a"
                          } ${i * (360 / 38)}deg ${(i + 1) * (360 / 38)}deg`
                      )
                      .join(", ")})`,
                  }}
                >
                  {wheelNumbers.map((n) => (
                    <NumberSlot
                      key={n.label}
                      style={{
                        transform: `rotate(${n.angle}deg)`,
                      }}
                    >
                      {n.label}
                    </NumberSlot>
                  ))}
                </NumberRing>
                <SpinningWheel>
                  <WheelWood />
                  <WheelCenter />
                </SpinningWheel>
                <Ball
                  style={{
                    transform: (() => {
                      const angleInRadians = ((ballAngle - 90) * Math.PI) / 180;
                      const radius = 90;
                      const x = radius * Math.cos(angleInRadians);
                      const y = radius * Math.sin(angleInRadians);
                      return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
                    })(),
                  }}
                />
              </InnerRing>
              <Pointer />
            </WoodRing>
            <WheelControls>
              <ButtonsRow>
                <Button
                  type="button"
                  onClick={handleSpin}
                  disabled={isSpinning || currentBets.length === 0}
                >
                  {isSpinning ? t("Spinning…") : t("Spin")}
                </Button>
                <Button
                  type="button"
                  onClick={clearBets}
                  disabled={isSpinning || currentBets.length === 0}
                >
                  {t("Clear bets")}
                </Button>
              </ButtonsRow>
            </WheelControls>
          </WheelArea>
          <BettingLayout>
            <InsideArea>
              <ZeroColumn>
                <ZeroCell
                  id="bet-straight-0"
                  type="button"
                  onClick={() => handleInsideNumberClick(0)}
                  $color={getColorForValue(0)}
                >
                  0
                </ZeroCell>
                <ZeroCell
                  id="bet-straight-00"
                  type="button"
                  onClick={() => handleInsideNumberClick("00")}
                  $color={getColorForValue("00")}
                >
                  00
                </ZeroCell>
              </ZeroColumn>
              <ZeroHitboxes>
                <ZeroTrioHitbox
                  id={`bet-street-trio-${ZERO_TRIO_NUMBERS.join("-")}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleZeroTrioClick();
                  }}
                />
                <ZeroFourHitbox
                  id={`bet-corner-${makeCornerLabel([1, 2, 3])}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleZeroFourClick();
                  }}
                />
              </ZeroHitboxes>
              <NumbersGrid>
                {BOARD_GRID.map((row, rowIndex) =>
                  row.map((number, columnIndex) => {
                    const verticalSplitNumbers =
                      rowIndex < BOARD_GRID.length - 1
                        ? [number, getBoardNumber(rowIndex + 1, columnIndex)]
                        : null;

                    const horizontalSplitNumbers =
                      columnIndex < row.length - 1
                        ? [number, getBoardNumber(rowIndex, columnIndex + 1)]
                        : null;

                    const cornerNumbers =
                      rowIndex < BOARD_GRID.length - 1 &&
                        columnIndex < row.length - 1
                        ? [
                          number,
                          getBoardNumber(rowIndex, columnIndex + 1),
                          getBoardNumber(rowIndex + 1, columnIndex),
                          getBoardNumber(rowIndex + 1, columnIndex + 1),
                        ]
                        : null;

                    const verticalLabel = verticalSplitNumbers && makeSplitLabel(verticalSplitNumbers[0], verticalSplitNumbers[1]);
                    const horizontalLabel = horizontalSplitNumbers && makeSplitLabel(horizontalSplitNumbers[0], horizontalSplitNumbers[1]);
                    const cornerLabel = cornerNumbers && makeCornerLabel(cornerNumbers);

                    return (
                      <InsideCell
                        key={`${rowIndex}-${columnIndex}`}
                        id={`bet-straight-${number}`}
                        type="button"
                        onClick={() => handleInsideNumberClick(number)}
                        $color={getColorForValue(number)}
                      >
                        {number}
                        {verticalSplitNumbers && verticalLabel && (
                          <SplitHitboxVertical
                            id={`bet-split-${verticalLabel}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSplitClick(verticalSplitNumbers[0], verticalSplitNumbers[1]);
                            }}
                          />
                        )}
                        {horizontalSplitNumbers && horizontalLabel && (
                          <SplitHitboxHorizontal
                            id={`bet-split-${horizontalLabel}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSplitClick(horizontalSplitNumbers[0], horizontalSplitNumbers[1]);
                            }}
                          />
                        )}
                        {cornerNumbers && cornerLabel && (
                          <CornerHitbox
                            id={`bet-corner-${cornerLabel}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCornerClick(cornerNumbers[0], cornerNumbers[1], cornerNumbers[2], cornerNumbers[3]);
                            }}
                          />
                        )}
                      </InsideCell>
                    );
                  })
                )}
              </NumbersGrid>
              <ColumnBets>
                {[1, 2, 3].map((index) => (
                  <ColumnBetCell key={index}>
                    <OutsideButton
                      id={`bet-high-2 to 1-${index}`}
                      type="button"
                      onClick={() => handleColumnClick(index as 1 | 2 | 3)}
                    >
                      {t("2 to 1")}
                    </OutsideButton>
                  </ColumnBetCell>
                ))}
              </ColumnBets>
            </InsideArea>
            <DozenRow>
              <OutsideButton
                id="bet-high-1st 12"
                type="button"
                onClick={() => handleDozenClick(1)}
              >
                {t("1st 12")}
              </OutsideButton>
              <OutsideButton
                id="bet-high-2nd 12"
                type="button"
                onClick={() => handleDozenClick(2)}
              >
                {t("2nd 12")}
              </OutsideButton>
              <OutsideButton
                id="bet-high-3rd 12"
                type="button"
                onClick={() => handleDozenClick(3)}
              >
                {t("3rd 12")}
              </OutsideButton>
            </DozenRow>
            <OutsideRowWrapper>
              <OutsideRow>
                <OutsideButton id="bet-low-low" type="button" onClick={() => handleOutsideClick("low")}>
                  {t("1 to 18")}
                </OutsideButton>
                <OutsideButton id="bet-even-even" type="button" onClick={() => handleOutsideClick("even")}>
                  {t("Even")}
                </OutsideButton>
                <OutsideButton id="bet-red-red" type="button" onClick={() => handleOutsideClick("red")} $variant="red">
                  {t("Red")}
                </OutsideButton>
                <OutsideButton id="bet-black-black" type="button" onClick={() => handleOutsideClick("black")} $variant="black">
                  {t("Black")}
                </OutsideButton>
                <OutsideButton id="bet-odd-odd" type="button" onClick={() => handleOutsideClick("odd")}>
                  {t("Odd")}
                </OutsideButton>
                <OutsideButton id="bet-high-high" type="button" onClick={() => handleOutsideClick("high")}>
                  {t("19 to 36")}
                </OutsideButton>
              </OutsideRow>
            </OutsideRowWrapper>
            <ChipRow>
              {CHIP_DENOMINATIONS.map((chip) => (
                <ChipButton
                  key={chip.value}
                  type="button"
                  onClick={() => handleChangeChip(chip.value)}
                  $active={chipValue === chip.value}
                  style={{ backgroundColor: chip.color }}
                >
                  {chip.value}
                </ChipButton>
              ))}
            </ChipRow>
          </BettingLayout>
        </ContentRow>

        <GlobalChipLayer bets={currentBets} />

        {showWinnerOverlay && winningNumber && (
          <WinnerOverlay $color={winningNumber.color}>
            <WinnerContent>
              <WinnerNumber>{winningNumber.label}</WinnerNumber>
              <WinnerMessage>
                {formatWinningMessage(
                  winningNumber.value,
                  winningNumber.color,
                  t
                )}
              </WinnerMessage>
            </WinnerContent>
          </WinnerOverlay>
        )}
      </Felt>
    </Scene>
  );
};

// ESTILOS

const Felt = styled.div`
  margin-top: 24px;
  padding: 24px;
  border-radius: 12px;
  background: radial-gradient(
      circle at top left,
      rgba(255, 255, 255, 0.08),
      transparent
    ),
    ${(props) => props.theme.backgroundContrast};
`;

const TopBar = styled.div`
  display: grid;
  grid-template-columns: 2fr 1.5fr 2fr;
  gap: 16px;
  margin-bottom: 24px;
`;

const Panel = styled.div`
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
  color: ${(props) => props.theme.text};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
`;

const WinnerPanel = styled(Panel)``;

const WheelTypePanel = styled(Panel)`
  background: linear-gradient(
    135deg,
    ${(props) => props.theme.noticeInfoBackground},
    ${(props) => props.theme.noticeInfoBorder}
  );
`;

const BalancePanel = styled(Panel)`
  text-align: right;
`;

const PanelTitle = styled.div`
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.9;
  margin-bottom: 6px;
`;

const PanelValue = styled.div`
  font-size: 20px;
  font-weight: 600;
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
`;

const BalanceRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
`;

const ContentRow = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const WheelArea = styled.div`
  flex: 1 1 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const WoodRing = styled.div`
  position: relative;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(
      circle at 30% 30%,
      rgba(255, 255, 255, 0.25),
      transparent
    ),
    #3b2414;
  box-shadow:
    0 0 0 6px #26160d,
    0 18px 40px rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DiamondInlay = styled.div`
  position: absolute;
  inset: 14px;
  border-radius: 50%;
  border: 4px dashed rgba(255, 215, 130, 0.8);
  box-shadow: 0 0 12px rgba(255, 215, 130, 0.5);
`;

const InnerRing = styled.div`
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NumberRing = styled.div`
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
`;

const NumberSlot = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  width: 30px;
  height: 50%;
  transform-origin: bottom center;
  margin-left: -15px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 5px;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
`;

const SpinningWheel = styled.div`
  position: absolute;
  inset: 30px;
  border-radius: 50%;
  overflow: hidden;
`;

const WheelWood = styled.div`
  width: 100%;
  height: 100%;
  background: conic-gradient(
    #532e18,
    #2b170c,
    #532e18,
    #2b170c,
    #532e18
  );
`;

const WheelCenter = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffffff, #cccccc);
  border: 4px solid #999;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
`;

const Ball = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fefefe;
  box-shadow:
    0 0 4px rgba(0, 0, 0, 0.7),
    0 0 8px rgba(255, 255, 255, 0.7);
`;

const Pointer = styled.div`
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 18px solid transparent;
  border-right: 18px solid transparent;
  border-bottom: 26px solid #f3bf3a;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.6));
`;

const WheelControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
`;

const ChipRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ChipButton = styled.button<{ $active: boolean }>`
  min-width: 40px;
  padding: 6px 10px;
  border-radius: 20px;
  border: 2px solid
    ${(props) =>
    props.$active ? props.theme.accent : props.theme.border};
  background: ${(props) =>
    props.$active ? props.theme.accent : props.theme.background};
  color: ${(props) =>
    props.$active ? props.theme.buttonText : props.theme.text};
  font-size: 12px;
  cursor: pointer;
`;

const ButtonsRow = styled.div`
  display: flex;
  gap: 8px;
`;

const BettingLayout = styled.div`
  flex: 1 1 460px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InsideArea = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4px;
`;

const ZeroColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ZeroCell = styled.button<{ $color: Color }>`
  height: 38px;
  position: relative;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: ${(props) =>
    props.$color === "green" ? "#0d7f3a" : "#212121"};
  color: #fff;
  font-size: 13px;
  cursor: pointer;
`;

const InsideGrid = styled.div`
  display: grid;
  grid-template-rows: repeat(3, 40px);
  grid-template-columns: repeat(12, 1fr);
  background: #0b5320;
  border-radius: 8px;
  border: 2px solid #173c22;
`;

const InsideCell = styled.button<{ $color: Color }>`
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: ${(props) =>
    props.$color === "green"
      ? "#0d7f3a"
      : props.$color === "red"
        ? "#b2152c"
        : "#212121"};
  color: #fff;
  font-size: 12px;
  cursor: pointer;
`;

const NumbersGrid = InsideGrid;

const SplitHitboxVertical = styled.button`
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translate(-50%, 50%);
  width: 70%;
  height: 16px;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  z-index: 10;
`;

const SplitHitboxHorizontal = styled.button`
  position: absolute;
  right: 0;
  top: 50%;
  transform: translate(50%, -50%);
  width: 16px;
  height: 70%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  z-index: 10;
`;

const CornerHitbox = styled.button`
  position: absolute;
  right: 0;
  bottom: 0;
  transform: translate(50%, 50%);
  width: 24px;
  height: 24px;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  z-index: 20;
`;

const ColumnBetCell = styled.div`
  display: flex;
  align-items: stretch;
`;

const ColumnBets = styled.div`
  display: grid;
  grid-template-rows: repeat(3, 40px);
  gap: 4px;
`;

const ZeroHitboxes = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
`;

const ZeroTrioHitbox = styled.button`
  pointer-events: auto;
  align-self: flex-end;
  margin-right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
`;

const ZeroFourHitbox = styled.button`
  pointer-events: auto;
  align-self: flex-end;
  margin-right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
`;

const OutsideRowWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DozenRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`;

const OutsideRow = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
`;

const OutsideButton = styled.button<{
  $variant?: "red" | "black";
}>`
  position: relative;
  padding: 8px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: ${(props) => {
    if (props.$variant === "red") return "#b2152c";
    if (props.$variant === "black") return "#000";
    return "#0b5320";
  }};
  color: #fff;
  font-size: 12px;
  cursor: pointer;
`;

const ChipOverlay = styled.div<{ $color: string }>`
  position: absolute !important;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: ${(props) => props.$color};
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999 !important;
`;

const WinnerOverlay = styled.div<{ $color: Color }>`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 40;
  pointer-events: none;
`;

const WinnerContent = styled.div`
  padding: 32px 48px;
  border-radius: 24px;
  text-align: center;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.9);
  background: rgba(0, 0, 0, 0.2);
`;

const WinnerNumber = styled.div`
  font-size: 80px;
  font-weight: 800;
  margin-bottom: 12px;
  color: #fff;
`;

const WinnerMessage = styled.div`
  font-size: 20px;
  color: #fff;
`;

export default observer(BetScene);