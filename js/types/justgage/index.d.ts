declare interface JustGage {
    new (options: any): JustGage;
    refresh(val: any, max?: any, config?: any);
    refreshTitle(val: string);
}