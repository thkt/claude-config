interface PriceCalculator {
  calculate(base: number): number;
}

export class DefaultPriceCalculator implements PriceCalculator {
  calculate(base: number) {
    return base * 1.1;
  }
}
